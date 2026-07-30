#!/usr/bin/env python3
"""Compute support-polygon geographic metrics for the ISPRS paper."""

from __future__ import annotations

import hashlib
import math
import textwrap
from pathlib import Path
from typing import Any

import geopandas as gpd
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from shapely.geometry import Point


DISTANCE_CRS = "EPSG:3095"
SAMPLES_PER_SUPPORT = 128
COAST_THRESHOLDS_KM = (5.0, 10.0, 20.0)
RIVER_THRESHOLDS_KM = (1.0, 2.0, 5.0)
WATER_THRESHOLDS_KM = (0.25, 0.5, 1.0)


def finite(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def stable_seed(value: str, seed: int) -> int:
    digest = hashlib.sha256(f"{seed}:{value}".encode("utf-8")).digest()
    return int.from_bytes(digest[:8], "big") % (2**32 - 1)


def first_by_key(
    records: list[dict[str, Any]], key_function: Any
) -> dict[Any, dict[str, Any]]:
    output: dict[Any, dict[str, Any]] = {}
    for record in records:
        key = key_function(record)
        if key not in output:
            output[key] = record
    return output


def support_geometries(
    records: list[dict[str, Any]], gadm_path: Path
) -> gpd.GeoDataFrame:
    gadm = gpd.read_file(gadm_path).to_crs("EPSG:4326")
    admin1 = (
        gadm[["NAME_1", "geometry"]]
        .dissolve(by="NAME_1", as_index=False)
        .to_crs(DISTANCE_CRS)
    )
    gadm_projected = gadm.to_crs(DISTANCE_CRS)

    prefecture_records = first_by_key(
        [
            record
            for record in records
            if record.get("_pref_gadm_name")
        ],
        lambda record: str(record.get("_pref_gadm_name")),
    )
    rows: list[dict[str, Any]] = []
    for _, feature in admin1.iterrows():
        gadm_name = str(feature["NAME_1"])
        record = prefecture_records.get(gadm_name)
        if record is None:
            continue
        rows.append(
            {
                "support_id": f"prefecture::{gadm_name}",
                "location_resolution": "prefecture",
                "prefecture": str(record.get("prefecture") or ""),
                "gadm_name_1": gadm_name,
                "municipality_candidate": "",
                "display_longitude": finite(record.get("_lng")),
                "display_latitude": finite(record.get("_lat")),
                "reported_river_density_km_per_1000km2": finite(
                    record.get("_pref_river_km_per_1000km2")
                ),
                "reported_coastline_density_km_per_1000km2": finite(
                    record.get("_pref_coastline_km_per_1000km2")
                ),
                "reported_lake_area_percent": finite(
                    record.get("_pref_lake_area_pct")
                ),
                "geometry": feature.geometry,
            }
        )

    municipality_records = first_by_key(
        [
            record
            for record in records
            if record.get("_geo_level") == "municipality"
            and record.get("_pref_gadm_name")
            and record.get("_admin2_context_name_en")
        ],
        lambda record: (
            str(record.get("_pref_gadm_name")),
            str(record.get("_admin2_context_name_en")),
        ),
    )
    admin2_lookup: dict[tuple[str, str], list[Any]] = {}
    for _, feature in gadm_projected.iterrows():
        key = (str(feature.get("NAME_1")), str(feature.get("NAME_2")))
        admin2_lookup.setdefault(key, []).append(feature)
    for key, record in municipality_records.items():
        candidates = admin2_lookup.get(key, [])
        if len(candidates) != 1:
            continue
        feature = candidates[0]
        rows.append(
            {
                "support_id": f"municipality::{key[0]}::{key[1]}",
                "location_resolution": "municipality",
                "prefecture": str(record.get("prefecture") or ""),
                "gadm_name_1": key[0],
                "municipality_candidate": str(
                    record.get("_geocoded_place")
                    or record.get("_admin2_context_name")
                    or key[1]
                ),
                "display_longitude": finite(record.get("_lng")),
                "display_latitude": finite(record.get("_lat")),
                "reported_river_density_km_per_1000km2": finite(
                    record.get("_admin2_river_km_per_1000km2")
                ),
                "reported_coastline_density_km_per_1000km2": finite(
                    record.get("_admin2_coastline_km_per_1000km2")
                ),
                "reported_lake_area_percent": finite(
                    record.get("_admin2_lake_area_pct")
                ),
                "geometry": feature.geometry,
            }
        )
    return gpd.GeoDataFrame(rows, geometry="geometry", crs=DISTANCE_CRS)


def sample_support_points(
    supports: gpd.GeoDataFrame, sample_size: int, seed: int
) -> gpd.GeoDataFrame:
    rows: list[dict[str, Any]] = []
    for _, support in supports.iterrows():
        support_seed = stable_seed(str(support["support_id"]), seed)
        sampled = gpd.GeoSeries(
            [support.geometry], crs=supports.crs
        ).sample_points(size=sample_size, rng=support_seed).iloc[0]
        points = list(sampled.geoms)
        if len(points) != sample_size:
            raise ValueError(
                f"Unexpected sample size for {support['support_id']}: {len(points)}"
            )
        for index, point in enumerate(points):
            rows.append(
                {
                    "support_id": support["support_id"],
                    "sample_index": index,
                    "geometry": point,
                }
            )
    return gpd.GeoDataFrame(rows, geometry="geometry", crs=supports.crs)


def nearest_distances_m(
    left: gpd.GeoDataFrame, right: gpd.GeoDataFrame, column: str
) -> pd.Series:
    joined = gpd.sjoin_nearest(
        left[["support_id", "geometry"]],
        right[["geometry"]],
        how="left",
        distance_col=column,
    )
    if "sample_index" in left.columns:
        joined["sample_index"] = left.loc[joined.index, "sample_index"]
        grouped = joined.groupby(["support_id", "sample_index"])[column].min()
        keys = list(zip(left["support_id"], left["sample_index"]))
        return pd.Series([grouped.get(key, np.nan) for key in keys], index=left.index)
    grouped = joined.groupby("support_id")[column].min()
    return left["support_id"].map(grouped)


def load_geographic_features(
    river_path: Path, lake_path: Path, coastline_path: Path
) -> tuple[gpd.GeoDataFrame, gpd.GeoDataFrame, gpd.GeoDataFrame]:
    rivers = gpd.read_file(river_path)[["geometry"]].to_crs(DISTANCE_CRS)
    lakes = gpd.read_file(lake_path)[["geometry"]].to_crs(DISTANCE_CRS)
    coastline = gpd.read_file(coastline_path)[["geometry"]].to_crs(DISTANCE_CRS)
    water = gpd.GeoDataFrame(
        pd.concat([rivers, lakes], ignore_index=True),
        geometry="geometry",
        crs=DISTANCE_CRS,
    )
    return rivers, water, coastline


def metric_row(
    support: pd.Series,
    samples: pd.DataFrame,
    min_coast_m: float,
    min_water_m: float,
    min_river_m: float,
) -> dict[str, Any]:
    coast_km = samples["distance_to_coast_m"].to_numpy(dtype=float) / 1000.0
    water_km = samples["distance_to_water_m"].to_numpy(dtype=float) / 1000.0
    river_km = samples["distance_to_river_m"].to_numpy(dtype=float) / 1000.0
    output = {
        "support_id": support["support_id"],
        "location_resolution": support["location_resolution"],
        "prefecture": support["prefecture"],
        "municipality_candidate": support["municipality_candidate"],
        "sample_points": len(samples),
        "support_polygon_area_km2": round(
            float(support.geometry.area) / 1_000_000.0, 3
        ),
        "minimum_distance_to_coast_km": round(float(min_coast_m) / 1000.0, 3),
        "sample_median_distance_to_coast_km": round(
            float(np.median(coast_km)), 3
        ),
        "minimum_distance_to_major_water_km": round(
            float(min_water_m) / 1000.0, 3
        ),
        "sample_median_distance_to_major_water_km": round(
            float(np.median(water_km)), 3
        ),
        "minimum_distance_to_river_km": round(float(min_river_m) / 1000.0, 3),
        "sample_median_distance_to_river_km": round(
            float(np.median(river_km)), 3
        ),
        "proportion_within_0_5_km_major_water": round(
            float(np.mean(water_km <= 0.5)), 5
        ),
        "proportion_within_2_km_river": round(
            float(np.mean(river_km <= 2.0)), 5
        ),
        "proportion_within_10_km_coastline": round(
            float(np.mean(coast_km <= 10.0)), 5
        ),
        "river_density_km_per_1000km2": support[
            "reported_river_density_km_per_1000km2"
        ],
        "coastline_density_km_per_1000km2": support[
            "reported_coastline_density_km_per_1000km2"
        ],
        "lake_area_percent": support["reported_lake_area_percent"],
    }
    for threshold in COAST_THRESHOLDS_KM:
        output[f"proportion_within_{threshold:g}_km_coast"] = round(
            float(np.mean(coast_km <= threshold)), 5
        )
    for threshold in RIVER_THRESHOLDS_KM:
        output[f"proportion_within_{threshold:g}_km_river"] = round(
            float(np.mean(river_km <= threshold)), 5
        )
    for threshold in WATER_THRESHOLDS_KM:
        output[f"proportion_within_{threshold:g}_km_water"] = round(
            float(np.mean(water_km <= threshold)), 5
        )
    return output


def summarise(values: list[float]) -> dict[str, Any]:
    data = np.asarray(values, dtype=float)
    data = data[np.isfinite(data)]
    if not data.size:
        return {"n": 0, "median": None, "q25": None, "q75": None}
    return {
        "n": int(data.size),
        "median": round(float(np.median(data)), 3),
        "q25": round(float(np.quantile(data, 0.25)), 3),
        "q75": round(float(np.quantile(data, 0.75)), 3),
    }


def refinement_comparison(
    metric_rows: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    prefectures = {
        row["prefecture"]: row
        for row in metric_rows
        if row["location_resolution"] == "prefecture"
    }
    comparisons: list[dict[str, Any]] = []
    metrics = (
        "support_polygon_area_km2",
        "minimum_distance_to_coast_km",
        "sample_median_distance_to_coast_km",
        "minimum_distance_to_major_water_km",
        "sample_median_distance_to_major_water_km",
        "proportion_within_0_5_km_major_water",
        "proportion_within_2_km_river",
        "proportion_within_10_km_coastline",
        "river_density_km_per_1000km2",
        "coastline_density_km_per_1000km2",
        "lake_area_percent",
    )
    for row in metric_rows:
        if row["location_resolution"] != "municipality":
            continue
        baseline = prefectures.get(row["prefecture"])
        if baseline is None:
            continue
        output: dict[str, Any] = {
            "prefecture": row["prefecture"],
            "municipality_candidate": row["municipality_candidate"],
        }
        for metric in metrics:
            municipality_value = finite(row.get(metric))
            prefecture_value = finite(baseline.get(metric))
            output[f"prefecture_{metric}"] = prefecture_value
            output[f"municipality_{metric}"] = municipality_value
            output[f"change_{metric}"] = (
                None
                if municipality_value is None or prefecture_value is None
                else round(municipality_value - prefecture_value, 5)
            )
        area = finite(row.get("support_polygon_area_km2"))
        baseline_area = finite(baseline.get("support_polygon_area_km2"))
        output["support_area_reduction_percent"] = (
            None
            if area is None or not baseline_area
            else round((1 - area / baseline_area) * 100.0, 3)
        )
        comparisons.append(output)
    return comparisons


def threshold_sensitivity(
    metric_rows: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    specifications = [
        ("coast", COAST_THRESHOLDS_KM),
        ("river", RIVER_THRESHOLDS_KM),
        ("water", WATER_THRESHOLDS_KM),
    ]
    for resolution in ("prefecture", "municipality"):
        selected = [
            row for row in metric_rows if row["location_resolution"] == resolution
        ]
        for family, thresholds in specifications:
            for threshold in thresholds:
                key = f"proportion_within_{threshold:g}_km_{family}"
                values = [
                    float(row[key])
                    for row in selected
                    if finite(row.get(key)) is not None
                ]
                rows.append(
                    {
                        "location_resolution": resolution,
                        "feature_family": family,
                        "threshold_km": threshold,
                        "support_units": len(values),
                        "median_polygon_proportion": round(
                            float(np.median(values)), 5
                        ),
                        "q25_polygon_proportion": round(
                            float(np.quantile(values, 0.25)), 5
                        ),
                        "q75_polygon_proportion": round(
                            float(np.quantile(values, 0.75)), 5
                        ),
                    }
                )
    return rows


def plot_crown_jewel(
    source_record: dict[str, Any],
    language_record: dict[str, Any],
    supports: gpd.GeoDataFrame,
    output_pdf: Path,
    output_png: Path,
) -> None:
    prefecture = str(source_record.get("prefecture") or "")
    municipality = str(source_record.get("_geocoded_place") or "")
    pref_support = supports[
        (supports["location_resolution"] == "prefecture")
        & (supports["prefecture"] == prefecture)
    ]
    municipality_support = supports[
        (supports["location_resolution"] == "municipality")
        & (supports["prefecture"] == prefecture)
        & (supports["municipality_candidate"] == municipality)
    ]
    if pref_support.empty or municipality_support.empty:
        raise ValueError("Crown-jewel example support geometry not found")

    fig = plt.figure(figsize=(11.4, 6.4))
    grid = fig.add_gridspec(
        2,
        2,
        height_ratios=[0.8, 2.2],
        width_ratios=[1.45, 1.0],
        hspace=0.18,
        wspace=0.16,
    )
    top = fig.add_subplot(grid[0, :])
    top.axis("off")
    summary = " ".join(str(source_record.get("summary") or "").split())
    if len(summary) > 155:
        summary = summary[:154] + "…"
    top.text(
        0.01,
        0.92,
        "One record, separate evidence channels",
        fontsize=16,
        fontweight="bold",
        va="top",
    )
    top.text(
        0.01,
        0.58,
        (
            f"Record {source_record.get('id')}  |  "
            f"{source_record.get('name')}  |  {prefecture}"
        ),
        fontsize=10.5,
        va="top",
    )
    top.text(
        0.01,
        0.32,
        textwrap.fill(summary, width=125),
        fontsize=9.5,
        va="top",
    )

    evidence = fig.add_subplot(grid[1, 0])
    evidence.axis("off")
    candidate_toponyms = ", ".join(
        language_record["candidate_toponym_mentions"]
    ) or "none detected"
    place_terms = ", ".join(language_record["place_function_terms"]) or "none"
    human_terms = ", ".join(language_record["human_condition_categories"]) or "none"
    interfaces = ", ".join(language_record["strict_interface_types"]) or "none"
    items = [
        ("Candidate toponym", candidate_toponyms, "#0072B2"),
        ("Non-toponymic place evidence", place_terms, "#E69F00"),
        ("Human-condition evidence", human_terms, "#CC79A7"),
        ("Derived interface evidence", interfaces, "#009E73"),
        (
            "Support basis",
            "rule-constrained unique municipality-name match; current administrative polygon",
            "#6B7280",
        ),
        (
            "Ambiguity retained",
            "representative display anchor is not an event location; historical-name and extraction precision are unvalidated",
            "#D55E00",
        ),
    ]
    y = 0.98
    for label, value, colour in items:
        evidence.text(
            0.01,
            y,
            label,
            fontsize=10.5,
            fontweight="bold",
            color=colour,
            va="top",
        )
        evidence.text(
            0.31,
            y,
            textwrap.fill(value, width=58),
            fontsize=9.2,
            va="top",
        )
        y -= 0.16

    map_axis = fig.add_subplot(grid[1, 1])
    pref_support.boundary.plot(
        ax=map_axis, color="#6B7280", linewidth=1.2, label="Prefecture support"
    )
    municipality_support.plot(
        ax=map_axis,
        facecolor="#56B4E9",
        edgecolor="#0072B2",
        alpha=0.5,
        linewidth=1.3,
        label="Municipality support",
    )
    point = gpd.GeoSeries(
        [
            Point(
                float(source_record["_lng"]),
                float(source_record["_lat"]),
            )
        ],
        crs="EPSG:4326",
    ).to_crs(DISTANCE_CRS)
    map_axis.scatter(
        [point.iloc[0].x],
        [point.iloc[0].y],
        s=55,
        marker="x",
        linewidth=2.0,
        color="#D55E00",
        label="Display anchor",
        zorder=4,
    )
    map_axis.set_title(
        "Display anchor versus warranted support", fontsize=11
    )
    map_axis.set_axis_off()
    map_axis.legend(loc="lower left", fontsize=8.5, frameon=True)
    fig.savefig(output_pdf, bbox_inches="tight")
    fig.savefig(output_png, dpi=300, bbox_inches="tight")
    plt.close(fig)


def build_support_metrics(
    records: list[dict[str, Any]],
    *,
    gadm_path: Path,
    river_path: Path,
    lake_path: Path,
    coastline_path: Path,
    seed: int,
    sample_size: int = SAMPLES_PER_SUPPORT,
) -> dict[str, Any]:
    supports = support_geometries(records, gadm_path)
    samples = sample_support_points(supports, sample_size, seed)
    rivers, water, coastline = load_geographic_features(
        river_path, lake_path, coastline_path
    )

    supports["min_coast_m"] = nearest_distances_m(
        supports, coastline, "min_coast_m"
    )
    supports["min_water_m"] = nearest_distances_m(
        supports, water, "min_water_m"
    )
    supports["min_river_m"] = nearest_distances_m(
        supports, rivers, "min_river_m"
    )
    samples["distance_to_coast_m"] = nearest_distances_m(
        samples, coastline, "distance_to_coast_m"
    )
    samples["distance_to_water_m"] = nearest_distances_m(
        samples, water, "distance_to_water_m"
    )
    samples["distance_to_river_m"] = nearest_distances_m(
        samples, rivers, "distance_to_river_m"
    )

    metric_rows = []
    grouped_samples = {
        support_id: group
        for support_id, group in samples.groupby("support_id")
    }
    for _, support in supports.iterrows():
        group = grouped_samples[str(support["support_id"])]
        metric_rows.append(
            metric_row(
                support,
                group,
                float(support["min_coast_m"]),
                float(support["min_water_m"]),
                float(support["min_river_m"]),
            )
        )
    comparisons = refinement_comparison(metric_rows)
    sensitivity = threshold_sensitivity(metric_rows)
    summary = {
        "support_units": len(metric_rows),
        "support_units_by_resolution": dict(
            pd.Series(
                [row["location_resolution"] for row in metric_rows]
            ).value_counts()
        ),
        "samples_per_support": sample_size,
        "distance_crs": DISTANCE_CRS,
        "municipality_comparisons": len(comparisons),
        "support_area_reduction_percent": summarise(
            [
                float(row["support_area_reduction_percent"])
                for row in comparisons
                if finite(row.get("support_area_reduction_percent")) is not None
            ]
        ),
        "absolute_change_sample_median_distance_to_coast_km": summarise(
            [
                abs(
                    float(
                        row[
                            "change_sample_median_distance_to_coast_km"
                        ]
                    )
                )
                for row in comparisons
                if finite(
                    row.get(
                        "change_sample_median_distance_to_coast_km"
                    )
                )
                is not None
            ]
        ),
        "absolute_change_sample_median_distance_to_major_water_km": summarise(
            [
                abs(
                    float(
                        row[
                            "change_sample_median_distance_to_major_water_km"
                        ]
                    )
                )
                for row in comparisons
                if finite(
                    row.get(
                        "change_sample_median_distance_to_major_water_km"
                    )
                )
                is not None
            ]
        ),
    }
    return {
        "supports": supports,
        "metric_rows": metric_rows,
        "comparisons": comparisons,
        "threshold_sensitivity": sensitivity,
        "summary": summary,
    }


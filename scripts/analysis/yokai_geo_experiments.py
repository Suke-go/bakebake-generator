#!/usr/bin/env python3
"""Run reproducible geography experiments for the Nichibun yokai map paper."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
import os
import platform
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

import matplotlib.pyplot as plt
import numpy as np


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_INPUT = ROOT / "data" / "nichibun" / "nichibun_enriched.json"
DEFAULT_OUTPUT_DIR = ROOT / "analysis" / "yokai_geo"

KYOTO_LNG = 135.75556
KYOTO_LAT = 35.02139

CATEGORY_LABELS = {
    "\u305d\u306e\u4ed6": "Other",
    "\u30ad\u30c4\u30cd": "Kitsune",
    "\u30d8\u30d3\u30fb\u30ea\u30e5\u30a6": "Snake/Dragon",
    "\u30e6\u30a6\u30ec\u30a4": "Yurei",
    "\u30ab\u30c3\u30d1": "Kappa",
    "\u30bf\u30cc\u30ad": "Tanuki",
    "\u30c6\u30f3\u30b0": "Tengu",
    "\u30aa\u30cb": "Oni",
    "\u30e4\u30de\u30ce\u30ab\u30df": "Yama-no-kami",
    "\u30a4\u30cc\u30ac\u30df": "Inugami",
    "\u30cd\u30b3": "Neko",
    "\u30d2\u30ce\u30bf\u30de": "Hitodama",
}

ALL_TERRAINS = ["coastal", "plain", "valley", "mountain", "inland_water", "unknown"]
TEST_TERRAINS = ["coastal", "plain", "valley"]
TERRAIN_COLORS = {
    # Color-blind distinguishable, muted for print.
    "coastal": "#009E73",
    "plain": "#E69F00",
    "valley": "#56B4E9",
    "mountain": "#8B5A2B",
    "inland_water": "#0072B2",
    "unknown": "#999999",
}


def configure_plots() -> None:
    plt.rcParams.update(
        {
            "font.size": 10,
            "axes.titlesize": 11,
            "axes.labelsize": 10,
            "xtick.labelsize": 9,
            "ytick.labelsize": 9,
            "legend.fontsize": 9,
            "axes.spines.top": False,
            "axes.spines.right": False,
            "axes.grid": True,
            "grid.alpha": 0.22,
            "grid.linewidth": 0.7,
            "figure.facecolor": "white",
            "axes.facecolor": "white",
        }
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run yokai geography experiments.")
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--top-n", type=int, default=12)
    return parser.parse_args()


def load_records(path: Path) -> list[dict[str, Any]]:
    with path.open("r", encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, list):
        raise ValueError(f"Expected list JSON at {path}")
    return [row for row in data if isinstance(row, dict)]


def ensure_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def write_json(path: Path, payload: Any) -> None:
    ensure_dir(path.parent)
    with path.open("w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)


def write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    ensure_dir(path.parent)
    if not rows:
        path.write_text("", encoding="utf-8")
        return
    with path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def num(value: Any) -> float | None:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    return parsed if math.isfinite(parsed) else None


def category_label(category: str) -> str:
    return CATEGORY_LABELS.get(category, category)


def terrain_value(record: dict[str, Any], field: str) -> str:
    value = record.get(field)
    if value is None and field != "_terrain_class":
        value = record.get("_terrain_class")
    return str(value or "unknown")


def haversine_km(lng1: float, lat1: float, lng2: float, lat2: float) -> float:
    radius = 6371.0088
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return 2 * radius * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def chi_square(table: np.ndarray) -> dict[str, float | int | None]:
    total = float(table.sum())
    if total <= 0:
        return {"chi_square": 0.0, "degrees_of_freedom": 0, "p_value": None, "cramers_v": 0.0}
    row_sum = table.sum(axis=1, keepdims=True)
    col_sum = table.sum(axis=0, keepdims=True)
    expected = row_sum @ col_sum / total
    mask = expected > 0
    statistic = float(((table - expected) ** 2 / np.where(mask, expected, 1)).sum())
    dof = int((table.shape[0] - 1) * (table.shape[1] - 1))
    cramers_v = math.sqrt(statistic / (total * max(1, min(table.shape) - 1)))
    p_value: float | None = None
    try:
        from scipy.stats import chi2  # type: ignore

        p_value = float(chi2.sf(statistic, dof))
    except Exception:
        p_value = None
    return {
        "chi_square": statistic,
        "degrees_of_freedom": dof,
        "p_value": p_value,
        "cramers_v": cramers_v,
    }


def contingency(records: list[dict[str, Any]], categories: list[str], terrains: list[str], terrain_field: str) -> np.ndarray:
    table = np.zeros((len(categories), len(terrains)), dtype=float)
    cat_index = {category: i for i, category in enumerate(categories)}
    terrain_index = {terrain: i for i, terrain in enumerate(terrains)}
    for record in records:
        category = str(record.get("major_category") or "unknown")
        terrain = terrain_value(record, terrain_field)
        if category in cat_index and terrain in terrain_index:
            table[cat_index[category], terrain_index[terrain]] += 1
    return table


def standardized_residuals(table: np.ndarray, categories: list[str], terrains: list[str]) -> list[dict[str, Any]]:
    total = float(table.sum())
    row_sum = table.sum(axis=1, keepdims=True)
    col_sum = table.sum(axis=0, keepdims=True)
    expected = row_sum @ col_sum / total
    rows: list[dict[str, Any]] = []
    for i, category in enumerate(categories):
        for j, terrain in enumerate(terrains):
            exp = float(expected[i, j])
            obs = float(table[i, j])
            residual = None if exp <= 0 else (obs - exp) / math.sqrt(exp)
            rows.append(
                {
                    "major_category": category,
                    "label": category_label(category),
                    "terrain": terrain,
                    "observed": int(obs),
                    "expected": round(exp, 3),
                    "standardized_residual": None if residual is None else round(residual, 4),
                }
            )
    return rows


def summarize(values: list[float]) -> dict[str, float | int | None]:
    if not values:
        return {"n": 0, "mean": None, "median": None, "q25": None, "q75": None}
    arr = np.asarray(values, dtype=float)
    return {
        "n": int(arr.size),
        "mean": round(float(arr.mean()), 3),
        "median": round(float(np.median(arr)), 3),
        "q25": round(float(np.quantile(arr, 0.25)), 3),
        "q75": round(float(np.quantile(arr, 0.75)), 3),
    }


def top_categories(records: list[dict[str, Any]], top_n: int) -> list[str]:
    counts = Counter(str(row.get("major_category") or "unknown") for row in records)
    return [category for category, _count in counts.most_common(top_n)]


def build_category_tables(records: list[dict[str, Any]], categories: list[str], terrain_field: str) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]:
    terrain_rows: list[dict[str, Any]] = []
    distance_rows: list[dict[str, Any]] = []
    kyoto_rows: list[dict[str, Any]] = []
    for category in categories:
        subset = [row for row in records if str(row.get("major_category") or "unknown") == category]
        total = len(subset) or 1
        counts = Counter(terrain_value(row, terrain_field) for row in subset)
        terrain_row: dict[str, Any] = {"major_category": category, "label": category_label(category), "n": len(subset)}
        for terrain in ALL_TERRAINS:
            count = counts.get(terrain, 0)
            terrain_row[f"n_{terrain}"] = count
            terrain_row[f"pct_{terrain}"] = round(count / total, 4)
        terrain_rows.append(terrain_row)

        coast = [value for value in (num(row.get("_dist_coast_km")) for row in subset) if value is not None]
        water = [value for value in (num(row.get("_dist_water_km")) for row in subset) if value is not None]
        kyoto = [
            haversine_km(KYOTO_LNG, KYOTO_LAT, float(row["_lng"]), float(row["_lat"]))
            for row in subset
            if num(row.get("_lng")) is not None and num(row.get("_lat")) is not None
        ]
        distance_rows.append(
            {
                "major_category": category,
                "label": category_label(category),
                **{f"coast_{k}": v for k, v in summarize(coast).items()},
                **{f"water_{k}": v for k, v in summarize(water).items()},
            }
        )
        kyoto_rows.append(
            {
                "major_category": category,
                "label": category_label(category),
                **{f"kyoto_{k}": v for k, v in summarize(kyoto).items()},
            }
        )
    return terrain_rows, distance_rows, kyoto_rows


def build_category_prefecture_context(records: list[dict[str, Any]], categories: list[str]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    metric_fields = {
        "pref_area_km2": "_pref_area_km2",
        "pref_coastline_km_per_1000km2": "_pref_coastline_km_per_1000km2",
        "pref_river_km_per_1000km2": "_pref_river_km_per_1000km2",
        "pref_lake_area_pct": "_pref_lake_area_pct",
    }
    for category in categories:
        subset = [row for row in records if str(row.get("major_category") or "unknown") == category]
        out: dict[str, Any] = {
            "major_category": category,
            "label": category_label(category),
            "n": len(subset),
            "prefecture_count": len({str(row.get("prefecture") or "unknown") for row in subset}),
        }
        for prefix, field in metric_fields.items():
            values = [value for value in (num(row.get(field)) for row in subset) if value is not None]
            out.update({f"{prefix}_{key}": value for key, value in summarize(values).items()})
        rows.append(out)
    return rows


def build_category_admin2_context(records: list[dict[str, Any]], categories: list[str]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    metric_fields = {
        "admin2_area_km2": "_admin2_area_km2",
        "admin2_coastline_km_per_1000km2": "_admin2_coastline_km_per_1000km2",
        "admin2_river_km_per_1000km2": "_admin2_river_km_per_1000km2",
        "admin2_lake_area_pct": "_admin2_lake_area_pct",
    }
    for category in categories:
        subset = [
            row
            for row in records
            if str(row.get("major_category") or "unknown") == category
            and str(row.get("_geo_level") or "") == "municipality"
            and num(row.get("_admin2_area_km2")) is not None
        ]
        out: dict[str, Any] = {
            "major_category": category,
            "label": category_label(category),
            "n": len(subset),
            "admin2_unit_count": len(
                {
                    (
                        str(row.get("prefecture") or "unknown"),
                        str(row.get("_admin2_context_name") or row.get("_admin2") or "unknown"),
                    )
                    for row in subset
                }
            ),
        }
        for prefix, field in metric_fields.items():
            values = [value for value in (num(row.get(field)) for row in subset) if value is not None]
            out.update({f"{prefix}_{key}": value for key, value in summarize(values).items()})
        rows.append(out)
    return rows


def prefecture_gis_context_rows(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in records:
        grouped[str(row.get("prefecture") or "unknown")].append(row)
    rows: list[dict[str, Any]] = []
    for pref, subset in grouped.items():
        first = subset[0]
        rows.append(
            {
                "prefecture": pref,
                "n": len(subset),
                "gadm_name": first.get("_pref_gadm_name"),
                "pref_area_km2": first.get("_pref_area_km2"),
                "pref_coastline_km": first.get("_pref_coastline_km"),
                "pref_coastline_km_per_1000km2": first.get("_pref_coastline_km_per_1000km2"),
                "pref_river_km": first.get("_pref_river_km"),
                "pref_river_km_per_1000km2": first.get("_pref_river_km_per_1000km2"),
                "pref_lake_area_km2": first.get("_pref_lake_area_km2"),
                "pref_lake_area_pct": first.get("_pref_lake_area_pct"),
                "river_source": first.get("_river_source"),
                "lake_source": first.get("_lake_source"),
                "coastline_source": first.get("_coastline_source"),
            }
        )
    return sorted(rows, key=lambda row: int(row["n"]), reverse=True)


def admin2_gis_context_rows(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for row in records:
        if str(row.get("_geo_level") or "") != "municipality":
            continue
        if num(row.get("_admin2_area_km2")) is None:
            continue
        key = (
            str(row.get("prefecture") or "unknown"),
            str(row.get("_admin2_context_name") or row.get("_admin2") or "unknown"),
        )
        grouped[key].append(row)
    rows: list[dict[str, Any]] = []
    for (pref, admin2_name), subset in grouped.items():
        first = subset[0]
        rows.append(
            {
                "prefecture": pref,
                "admin2": admin2_name,
                "n": len(subset),
                "admin2_type": first.get("_admin2_context_type"),
                "admin2_area_km2": first.get("_admin2_area_km2"),
                "admin2_coastline_km": first.get("_admin2_coastline_km"),
                "admin2_coastline_km_per_1000km2": first.get("_admin2_coastline_km_per_1000km2"),
                "admin2_river_km": first.get("_admin2_river_km"),
                "admin2_river_km_per_1000km2": first.get("_admin2_river_km_per_1000km2"),
                "admin2_lake_area_km2": first.get("_admin2_lake_area_km2"),
                "admin2_lake_area_pct": first.get("_admin2_lake_area_pct"),
                "river_source": first.get("_river_source"),
                "lake_source": first.get("_lake_source"),
                "coastline_source": first.get("_coastline_source"),
            }
        )
    return sorted(rows, key=lambda row: int(row["n"]), reverse=True)


def other_exclusion_sensitivity(records: list[dict[str, Any]], categories: list[str], terrains: list[str], terrain_field: str) -> dict[str, Any]:
    other = "\u305d\u306e\u4ed6"
    included = [row for row in records if str(row.get("major_category") or "unknown") in categories]
    no_other_categories = [category for category in categories if category != other]
    no_other = [row for row in included if str(row.get("major_category") or "unknown") != other]
    all_chi = chi_square(contingency(included, categories, terrains, terrain_field))
    no_other_chi = chi_square(contingency(no_other, no_other_categories, terrains, terrain_field))
    return {
        "terrains": terrains,
        "all": {"records": len(included), "categories": categories, "chi_square": all_chi},
        "other_excluded": {"records": len(no_other), "categories": no_other_categories, "chi_square": no_other_chi},
        "delta_cramers_v": round(float(no_other_chi["cramers_v"]) - float(all_chi["cramers_v"]), 5),
    }


def prefecture_centroid_bias_rows(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in records:
        grouped[str(row.get("prefecture") or "unknown")].append(row)
    rows: list[dict[str, Any]] = []
    for pref, subset in grouped.items():
        n = len(subset)
        terrain_counts = Counter(terrain_value(row, "_terrain_coord_only") for row in subset)
        level_counts = Counter(str(row.get("_geo_level") or "unknown") for row in subset)
        lngs = [value for value in (num(row.get("_lng")) for row in subset) if value is not None]
        lats = [value for value in (num(row.get("_lat")) for row in subset) if value is not None]
        coast = [value for value in (num(row.get("_dist_coast_km")) for row in subset) if value is not None]
        water = [value for value in (num(row.get("_dist_water_km")) for row in subset) if value is not None]
        row: dict[str, Any] = {
            "prefecture": pref,
            "n": n,
            "centroid_lng": None if not lngs else round(float(np.median(lngs)), 5),
            "centroid_lat": None if not lats else round(float(np.median(lats)), 5),
            "centroid_terrain_class": terrain_counts.most_common(1)[0][0] if terrain_counts else "unknown",
            "dist_coast_km": None if not coast else round(float(np.median(coast)), 3),
            "dist_water_km": None if not water else round(float(np.median(water)), 3),
            "geo_level_mode": level_counts.most_common(1)[0][0] if level_counts else "unknown",
        }
        for terrain in TEST_TERRAINS:
            count = terrain_counts.get(terrain, 0)
            row[f"n_{terrain}"] = count
            row[f"pct_{terrain}"] = round(count / n, 4) if n else 0
        rows.append(row)
    return sorted(rows, key=lambda row: int(row["n"]), reverse=True)


def plot_terrain_proportions(path: Path, rows: list[dict[str, Any]], categories: list[str]) -> None:
    # Horizontal 100% bars keep category labels readable and support share comparison.
    row_by_category = {row["major_category"]: row for row in rows}
    categories = sorted(
        categories,
        key=lambda category: (
            -float(row_by_category[category].get("pct_mountain") or 0),
            -float(row_by_category[category].get("pct_inland_water") or 0),
            category_label(category),
        ),
    )
    y = np.arange(len(categories))
    lefts = np.zeros(len(categories))
    fig_height = max(5.2, 0.44 * len(categories) + 1.6)
    plt.figure(figsize=(9.2, fig_height))
    for terrain in TEST_TERRAINS:
        values = np.array([float(row_by_category[category].get(f"pct_{terrain}") or 0) for category in categories])
        plt.barh(y, values, left=lefts, color=TERRAIN_COLORS.get(terrain, "#999999"), label=terrain)
        for idx, value in enumerate(values):
            if value >= 0.18:
                plt.text(lefts[idx] + value / 2, idx, f"{value:.0%}", ha="center", va="center", fontsize=8, color="white")
        lefts += values
    plt.yticks(y, [category_label(c) for c in categories])
    plt.xlabel("Share of records")
    plt.xlim(0, 1)
    plt.gca().invert_yaxis()
    plt.title("Terrain composition by yokai category")
    plt.legend(ncol=min(5, len(TEST_TERRAINS)), frameon=False, loc="lower center", bbox_to_anchor=(0.5, -0.22))
    plt.tight_layout()
    plt.savefig(path, dpi=220)
    plt.close()


def plot_distance_bars(path: Path, rows: list[dict[str, Any]], categories: list[str], key: str, title: str) -> None:
    row_by_category = {row["major_category"]: row for row in rows}
    ordered = sorted(categories, key=lambda category: float(row_by_category[category].get(key) or 0))
    values = [float(row_by_category[category].get(key) or 0) for category in ordered]
    y = np.arange(len(ordered))
    plt.figure(figsize=(8.2, max(4.8, 0.38 * len(ordered) + 1.0)))
    plt.barh(y, values, color="#0072B2")
    plt.yticks(y, [category_label(c) for c in ordered])
    plt.xlabel("Median distance (km)")
    plt.title(title)
    for idx, value in enumerate(values):
        plt.text(value, idx, f" {value:.1f}", va="center", fontsize=8)
    plt.tight_layout()
    plt.savefig(path, dpi=220)
    plt.close()


def plot_residuals(path: Path, rows: list[dict[str, Any]], categories: list[str], terrains: list[str], title: str) -> None:
    by_key = {(row["major_category"], row["terrain"]): row for row in rows}
    values = np.zeros((len(categories), len(terrains)))
    for i, category in enumerate(categories):
        for j, terrain in enumerate(terrains):
            values[i, j] = float(by_key[(category, terrain)]["standardized_residual"] or 0)
    vmax = min(max(4.0, float(np.max(np.abs(values)))), 14.0)
    plt.figure(figsize=(7.5, max(4.8, 0.38 * len(categories))))
    image = plt.imshow(values, cmap="RdBu_r", vmin=-vmax, vmax=vmax, aspect="auto")
    plt.colorbar(image, label="Standardized residual")
    plt.xticks(np.arange(len(terrains)), terrains)
    plt.yticks(np.arange(len(categories)), [category_label(c) for c in categories])
    plt.title(title)
    plt.gca().set_xticks(np.arange(-0.5, len(terrains), 1), minor=True)
    plt.gca().set_yticks(np.arange(-0.5, len(categories), 1), minor=True)
    plt.grid(which="minor", color="white", linewidth=0.8)
    plt.tick_params(which="minor", bottom=False, left=False)
    for i in range(values.shape[0]):
        for j in range(values.shape[1]):
            if abs(values[i, j]) >= 2:
                color = "white" if abs(values[i, j]) > vmax * 0.55 else "black"
                plt.text(j, i, f"{values[i, j]:.1f}", ha="center", va="center", fontsize=8, color=color)
    plt.tight_layout()
    plt.savefig(path, dpi=220)
    plt.close()


def plot_centroid_bias(path: Path, rows: list[dict[str, Any]]) -> None:
    counts = Counter(str(row["centroid_terrain_class"]) for row in rows)
    labels = [label for label, _count in counts.most_common()]
    values = [counts[label] for label in labels]
    y = np.arange(len(labels))
    plt.figure(figsize=(6.6, 3.8))
    plt.barh(y, values, color=[TERRAIN_COLORS.get(label, "#999999") for label in labels])
    plt.yticks(y, labels)
    plt.xlabel("Prefecture centroids")
    plt.title("Centroid terrain labels are coarse metadata")
    for i, value in enumerate(values):
        plt.text(value, i, f" {value}", va="center")
    plt.xlim(0, max(values) * 1.18 if values else 1)
    plt.tight_layout()
    plt.savefig(path, dpi=220)
    plt.close()


def representation_terrains(records: list[dict[str, Any]], field: str) -> list[str]:
    counts = Counter(terrain_value(row, field) for row in records)
    terrains = [terrain for terrain in ALL_TERRAINS if terrain != "unknown" and counts.get(terrain, 0) > 0]
    if counts.get("unknown", 0):
        terrains.append("unknown")
    return terrains or ["unknown"]


def terrain_transition_rows(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    counts = Counter(
        (terrain_value(row, "_terrain_coord_only"), terrain_value(row, "_terrain_text_aware"))
        for row in records
    )
    rows = [
        {
            "coordinate_only": coord,
            "text_aware": text,
            "n": count,
            "share": round(count / (len(records) or 1), 5),
        }
        for (coord, text), count in counts.items()
    ]
    return sorted(rows, key=lambda row: (-int(row["n"]), str(row["coordinate_only"]), str(row["text_aware"])))


def plot_transition_matrix(path: Path, rows: list[dict[str, Any]], coord_terrains: list[str], text_terrains: list[str]) -> None:
    counts = {(row["coordinate_only"], row["text_aware"]): int(row["n"]) for row in rows}
    values = np.zeros((len(coord_terrains), len(text_terrains)))
    for i, coord in enumerate(coord_terrains):
        for j, text in enumerate(text_terrains):
            values[i, j] = counts.get((coord, text), 0)
    plt.figure(figsize=(7.2, 5.2))
    image = plt.imshow(values, cmap="Blues", aspect="auto")
    plt.colorbar(image, label="Records")
    plt.xticks(np.arange(len(text_terrains)), text_terrains, rotation=30, ha="right")
    plt.yticks(np.arange(len(coord_terrains)), coord_terrains)
    plt.xlabel("Text-aware terrain label")
    plt.ylabel("Coordinate-only terrain label")
    plt.title("Terrain labels added or changed by narrative cues")
    vmax = float(np.max(values)) if values.size else 0.0
    for i in range(values.shape[0]):
        for j in range(values.shape[1]):
            value = int(values[i, j])
            if value:
                color = "white" if value > vmax * 0.45 else "black"
                plt.text(j, i, f"{value:,}", ha="center", va="center", fontsize=8, color=color)
    plt.tight_layout()
    plt.savefig(path, dpi=220)
    plt.close()


def plot_terrain_counts(path: Path, counts: Counter[str], title: str) -> None:
    labels = [terrain for terrain in ALL_TERRAINS if counts.get(terrain, 0) > 0]
    values = [counts[terrain] for terrain in labels]
    y = np.arange(len(labels))
    plt.figure(figsize=(6.8, 4.2))
    plt.barh(y, values, color=[TERRAIN_COLORS.get(label, "#999999") for label in labels])
    plt.yticks(y, labels)
    plt.xlabel("Records")
    plt.title(title)
    for idx, value in enumerate(values):
        plt.text(value, idx, f" {value:,}", va="center", fontsize=9)
    plt.xlim(0, max(values) * 1.18 if values else 1)
    plt.gca().invert_yaxis()
    plt.tight_layout()
    plt.savefig(path, dpi=220)
    plt.close()


def plot_category_prefecture_context(path: Path, rows: list[dict[str, Any]], categories: list[str]) -> None:
    row_by_category = {row["major_category"]: row for row in rows}
    ordered = sorted(
        categories,
        key=lambda category: float(row_by_category[category].get("pref_river_km_per_1000km2_median") or 0),
        reverse=True,
    )
    labels = [category_label(category) for category in ordered]
    y = np.arange(len(ordered))
    river = [float(row_by_category[category].get("pref_river_km_per_1000km2_median") or 0) for category in ordered]
    coast = [float(row_by_category[category].get("pref_coastline_km_per_1000km2_median") or 0) for category in ordered]

    fig, axes = plt.subplots(1, 2, figsize=(10.4, max(5.2, 0.42 * len(ordered) + 1.4)), sharey=True)
    axes[0].barh(y, river, color="#0072B2")
    axes[0].set_title("River density")
    axes[0].set_xlabel("Median km per 1,000 km2")
    axes[0].set_yticks(y)
    axes[0].set_yticklabels(labels)
    axes[0].invert_yaxis()
    for idx, value in enumerate(river):
        axes[0].text(value, idx, f" {value:.0f}", va="center", fontsize=8)

    axes[1].barh(y, coast, color="#009E73")
    axes[1].set_title("Coastline density")
    axes[1].set_xlabel("Median km per 1,000 km2")
    for idx, value in enumerate(coast):
        axes[1].text(value, idx, f" {value:.1f}", va="center", fontsize=8)

    fig.suptitle("Record-weighted prefecture-polygon GIS context by yokai category", y=0.99)
    plt.tight_layout()
    plt.savefig(path, dpi=220)
    plt.close()


def plot_category_admin2_context_comparison(
    path: Path,
    pref_rows: list[dict[str, Any]],
    admin2_rows: list[dict[str, Any]],
    categories: list[str],
) -> None:
    admin2_by_category = {row["major_category"]: row for row in admin2_rows if int(row.get("n") or 0) > 0}
    pref_by_category = {row["major_category"]: row for row in pref_rows}
    ordered = [
        category
        for category in sorted(
            categories,
            key=lambda item: float(admin2_by_category.get(item, {}).get("admin2_river_km_per_1000km2_median") or 0),
            reverse=True,
        )
        if category in admin2_by_category
    ]
    if not ordered:
        return

    labels = [category_label(category) for category in ordered]
    y = np.arange(len(ordered))
    pref_river = [float(pref_by_category[category].get("pref_river_km_per_1000km2_median") or 0) for category in ordered]
    admin2_river = [
        float(admin2_by_category[category].get("admin2_river_km_per_1000km2_median") or 0)
        for category in ordered
    ]
    pref_coast = [float(pref_by_category[category].get("pref_coastline_km_per_1000km2_median") or 0) for category in ordered]
    admin2_coast = [
        float(admin2_by_category[category].get("admin2_coastline_km_per_1000km2_median") or 0)
        for category in ordered
    ]

    fig, axes = plt.subplots(1, 2, figsize=(10.6, max(5.2, 0.42 * len(ordered) + 1.5)), sharey=True)
    height = 0.36
    axes[0].barh(y - height / 2, pref_river, height=height, color="#9AA0A6", label="prefecture context")
    axes[0].barh(y + height / 2, admin2_river, height=height, color="#0072B2", label="admin2 context")
    axes[0].set_title("River density")
    axes[0].set_xlabel("Median km per 1,000 km2")
    axes[0].set_yticks(y)
    axes[0].set_yticklabels(labels)
    axes[0].invert_yaxis()
    axes[0].legend(frameon=False, loc="lower right")

    axes[1].barh(y - height / 2, pref_coast, height=height, color="#9AA0A6", label="prefecture context")
    axes[1].barh(y + height / 2, admin2_coast, height=height, color="#009E73", label="admin2 context")
    axes[1].set_title("Coastline density")
    axes[1].set_xlabel("Median km per 1,000 km2")

    fig.suptitle("Polygon context shifts for locally refined records", y=0.99)
    plt.tight_layout()
    plt.savefig(path, dpi=220)
    plt.close()


def plot_prefecture_gis_context(path: Path, rows: list[dict[str, Any]]) -> None:
    filtered = [
        row
        for row in rows
        if num(row.get("pref_coastline_km_per_1000km2")) is not None
        and num(row.get("pref_river_km_per_1000km2")) is not None
    ]
    if not filtered:
        return
    x = np.array([float(row["pref_coastline_km_per_1000km2"]) for row in filtered])
    y = np.array([float(row["pref_river_km_per_1000km2"]) for row in filtered])
    n = np.array([int(row["n"]) for row in filtered])
    size = 30 + 280 * np.sqrt(n / max(1, n.max()))
    lake = np.array([float(row.get("pref_lake_area_pct") or 0) for row in filtered])

    plt.figure(figsize=(7.2, 5.6))
    scatter = plt.scatter(x, y, s=size, c=lake, cmap="Blues", alpha=0.72, edgecolor="#333333", linewidth=0.4)
    plt.colorbar(scatter, label="Lake area share (%)")
    plt.xlabel("Coastline density (km per 1,000 km2)")
    plt.ylabel("River density (km per 1,000 km2)")
    plt.title("Prefecture-polygon GIS context used by the baseline")
    for row in sorted(filtered, key=lambda item: int(item["n"]), reverse=True)[:10]:
        label = str(row.get("gadm_name") or row.get("prefecture") or "")
        plt.text(
            float(row["pref_coastline_km_per_1000km2"]),
            float(row["pref_river_km_per_1000km2"]),
            label,
            fontsize=8,
            ha="center",
            va="center",
        )
    plt.tight_layout()
    plt.savefig(path, dpi=220)
    plt.close()


def run(records: list[dict[str, Any]], output_dir: Path, top_n: int) -> dict[str, Any]:
    global TEST_TERRAINS
    configure_plots()
    ensure_dir(output_dir)
    categories = top_categories(records, top_n)
    category_counts = Counter(str(row.get("major_category") or "unknown") for row in records)
    coord_terrain_counts = Counter(terrain_value(row, "_terrain_coord_only") for row in records)
    text_terrain_counts = Counter(terrain_value(row, "_terrain_text_aware") for row in records)
    terrain_counts = text_terrain_counts
    coord_terrains = representation_terrains(records, "_terrain_coord_only")
    text_terrains = representation_terrains(records, "_terrain_text_aware")
    TEST_TERRAINS = text_terrains
    pref_counts = Counter(str(row.get("prefecture") or "unknown") for row in records)
    geo_level_counts = Counter(str(row.get("_geo_level") or "unknown") for row in records)

    coord_terrain_rows, _coord_distance_rows, _coord_kyoto_rows = build_category_tables(
        records, categories, "_terrain_coord_only"
    )
    terrain_rows, distance_rows, kyoto_rows = build_category_tables(records, categories, "_terrain_text_aware")
    coord_table = contingency(records, categories, coord_terrains, "_terrain_coord_only")
    test_table = contingency(records, categories, text_terrains, "_terrain_text_aware")
    coord_chi = chi_square(coord_table)
    test_chi = chi_square(test_table)
    residual_rows = standardized_residuals(test_table, categories, text_terrains)
    coord_residual_rows = standardized_residuals(coord_table, categories, coord_terrains)
    sensitivity = other_exclusion_sensitivity(records, categories, text_terrains, "_terrain_text_aware")
    coord_sensitivity = other_exclusion_sensitivity(records, categories, coord_terrains, "_terrain_coord_only")
    centroid_rows = prefecture_centroid_bias_rows(records)
    centroid_counts = Counter(str(row["centroid_terrain_class"]) for row in centroid_rows)
    transition_rows = terrain_transition_rows(records)
    changed_labels = sum(int(row["n"]) for row in transition_rows if row["coordinate_only"] != row["text_aware"])
    category_pref_context_rows = build_category_prefecture_context(records, categories)
    category_admin2_context_rows = build_category_admin2_context(records, categories)
    pref_gis_context_rows = prefecture_gis_context_rows(records)
    admin2_gis_rows = admin2_gis_context_rows(records)
    river_source_counts = Counter(str(row.get("_river_source") or "unknown") for row in records)
    admin2_context_records = sum(int(row["n"]) for row in admin2_gis_rows)

    summary = {
        "input_records": len(records),
        "category_counts": dict(category_counts.most_common()),
        "terrain_counts": dict(terrain_counts.most_common()),
        "coordinate_only_terrain_counts": dict(coord_terrain_counts.most_common()),
        "text_aware_terrain_counts": dict(text_terrain_counts.most_common()),
        "terrain_label_changes": {
            "records": changed_labels,
            "share": round(changed_labels / (len(records) or 1), 5),
            "top_transitions": transition_rows[:12],
        },
        "geo_level_counts": dict(geo_level_counts.most_common()),
        "prefecture_counts_top10": dict(pref_counts.most_common(10)),
        "top_categories": categories,
        "tested_terrains": text_terrains,
        "coordinate_only_tested_terrains": coord_terrains,
        "category_terrain_chi_square": test_chi,
        "coordinate_only_category_terrain_chi_square": coord_chi,
        "terrain_representation_comparison": {
            "coordinate_only": {"terrains": coord_terrains, "chi_square": coord_chi},
            "text_aware": {"terrains": text_terrains, "chi_square": test_chi},
            "delta_cramers_v": round(float(test_chi["cramers_v"]) - float(coord_chi["cramers_v"]), 5),
        },
        "largest_abs_standardized_residuals": sorted(
            residual_rows,
            key=lambda row: abs(float(row["standardized_residual"] or 0)),
            reverse=True,
        )[:12],
        "other_exclusion_sensitivity": sensitivity,
        "coordinate_only_other_exclusion_sensitivity": coord_sensitivity,
        "prefecture_centroid_bias": {
            "prefecture_count": len(centroid_rows),
            "centroid_terrain_class_counts": dict(centroid_counts.most_common()),
            "top_record_count_prefectures": centroid_rows[:10],
        },
        "prefecture_gis_context": {
            "prefecture_count": len(pref_gis_context_rows),
            "river_source_counts": dict(river_source_counts.most_common()),
            "top_record_count_prefectures": pref_gis_context_rows[:10],
            "top_river_density_prefectures": sorted(
                pref_gis_context_rows,
                key=lambda row: float(row.get("pref_river_km_per_1000km2") or 0),
                reverse=True,
            )[:10],
            "top_coastline_density_prefectures": sorted(
                pref_gis_context_rows,
                key=lambda row: float(row.get("pref_coastline_km_per_1000km2") or 0),
                reverse=True,
            )[:10],
        },
        "admin2_gis_context": {
            "record_count": admin2_context_records,
            "admin2_unit_count": len(admin2_gis_rows),
            "top_record_count_admin2": admin2_gis_rows[:10],
            "top_river_density_admin2": sorted(
                admin2_gis_rows,
                key=lambda row: float(row.get("admin2_river_km_per_1000km2") or 0),
                reverse=True,
            )[:10],
            "top_coastline_density_admin2": sorted(
                admin2_gis_rows,
                key=lambda row: float(row.get("admin2_coastline_km_per_1000km2") or 0),
                reverse=True,
            )[:10],
        },
        "interpretation_guardrail": (
            "Most reported coordinates remain prefecture centroids; local GADM admin2 "
            "matching refines only records with an unambiguous municipality mention. "
            "Coordinate-only terrain results therefore diagnose metadata geography, "
            "whereas admin2-polygon context is reported only for the refined subset. "
            "Text-aware terrain labels are an enriched representation and should not be "
            "read as independent evidence of real event locations."
        ),
    }

    write_csv(output_dir / "category_terrain_table.csv", terrain_rows)
    write_csv(output_dir / "category_terrain_text_aware_table.csv", terrain_rows)
    write_csv(output_dir / "category_terrain_coordinate_only_table.csv", coord_terrain_rows)
    write_csv(output_dir / "category_distance_stats.csv", distance_rows)
    write_csv(output_dir / "category_kyoto_distance_stats.csv", kyoto_rows)
    write_csv(output_dir / "prefecture_record_counts.csv", [{"prefecture": p, "n": c, "share": round(c / len(records), 5)} for p, c in pref_counts.most_common()])
    write_csv(output_dir / "category_terrain_standardized_residuals.csv", residual_rows)
    write_csv(output_dir / "category_terrain_coordinate_only_standardized_residuals.csv", coord_residual_rows)
    write_csv(output_dir / "terrain_representation_transition.csv", transition_rows)
    write_csv(output_dir / "prefecture_centroid_bias_diagnostics.csv", centroid_rows)
    write_csv(output_dir / "category_prefecture_gis_context.csv", category_pref_context_rows)
    write_csv(output_dir / "category_admin2_gis_context.csv", category_admin2_context_rows)
    write_csv(output_dir / "prefecture_gis_context.csv", pref_gis_context_rows)
    write_csv(output_dir / "admin2_gis_context.csv", admin2_gis_rows)
    write_json(output_dir / "other_exclusion_sensitivity.json", sensitivity)
    write_json(output_dir / "coordinate_only_other_exclusion_sensitivity.json", coord_sensitivity)
    write_json(output_dir / "experiment_summary.json", summary)

    plot_terrain_proportions(output_dir / "fig_category_terrain_proportions.png", terrain_rows, categories)
    plot_terrain_proportions(output_dir / "fig_category_terrain_coordinate_only_proportions.png", coord_terrain_rows, categories)
    plot_terrain_counts(output_dir / "fig_records_by_terrain.png", text_terrain_counts, "Text-aware terrain labels")
    plot_terrain_counts(
        output_dir / "fig_records_by_coordinate_only_terrain.png",
        coord_terrain_counts,
        "Coordinate-only terrain labels",
    )
    plot_distance_bars(output_dir / "fig_category_median_coast_distance.png", distance_rows, categories, "coast_median", "Median distance to coastline by category (prefecture centroids)")
    plot_distance_bars(output_dir / "fig_category_median_kyoto_distance.png", kyoto_rows, categories, "kyoto_median", "Median distance from Kyoto by category (prefecture centroids)")
    plot_residuals(
        output_dir / "fig_category_terrain_standardized_residuals.png",
        residual_rows,
        categories,
        text_terrains,
        "Cells driving the text-aware category-terrain association",
    )
    plot_residuals(
        output_dir / "fig_category_terrain_coordinate_only_standardized_residuals.png",
        coord_residual_rows,
        categories,
        coord_terrains,
        "Cells driving the coordinate-only category-terrain association",
    )
    plot_transition_matrix(output_dir / "fig_terrain_representation_transition.png", transition_rows, coord_terrains, text_terrains)
    plot_centroid_bias(output_dir / "fig_prefecture_centroid_bias.png", centroid_rows)
    plot_category_prefecture_context(
        output_dir / "fig_category_prefecture_gis_context.png",
        category_pref_context_rows,
        categories,
    )
    plot_category_admin2_context_comparison(
        output_dir / "fig_category_admin2_context_comparison.png",
        category_pref_context_rows,
        category_admin2_context_rows,
        categories,
    )
    plot_prefecture_gis_context(output_dir / "fig_prefecture_gis_context.png", pref_gis_context_rows)
    return summary


def main() -> None:
    args = parse_args()
    summary = run(load_records(args.input), args.output_dir, args.top_n)
    summary["manifest"] = {
        "input": str(args.input),
        "input_sha256": sha256_file(args.input),
        "output_dir": str(args.output_dir),
        "top_n": args.top_n,
        "python": sys.version,
        "platform": platform.platform(),
        "numpy": np.__version__,
    }
    write_json(args.output_dir / "experiment_summary.json", summary)
    chi = summary["category_terrain_chi_square"]
    p = chi["p_value"]
    p_text = "not computed" if p is None else f"{p:.3g}"
    no_other = summary["other_exclusion_sensitivity"]["other_excluded"]["chi_square"]
    print("=== Yokai geography experiments ===")
    print(f"Records: {summary['input_records']:,}")
    print(f"Geo levels: {summary['geo_level_counts']}")
    print(f"Coordinate-only terrain counts: {summary['coordinate_only_terrain_counts']}")
    print(f"Text-aware terrain counts: {summary['text_aware_terrain_counts']}")
    print(
        "Text-aware label changes: "
        f"{summary['terrain_label_changes']['records']:,} "
        f"({summary['terrain_label_changes']['share']:.1%})"
    )
    coord = summary["coordinate_only_category_terrain_chi_square"]
    coord_p = coord["p_value"]
    coord_p_text = "not computed" if coord_p is None else f"{coord_p:.3g}"
    print(
        "Category x coordinate-only terrain association: "
        f"chi2={coord['chi_square']:.2f}, df={coord['degrees_of_freedom']}, "
        f"p={coord_p_text}, Cramer's V={coord['cramers_v']:.3f}"
    )
    print(
        "Category x text-aware terrain association: "
        f"chi2={chi['chi_square']:.2f}, df={chi['degrees_of_freedom']}, "
        f"p={p_text}, Cramer's V={chi['cramers_v']:.3f}"
    )
    print(f"Representation delta Cramer's V: {summary['terrain_representation_comparison']['delta_cramers_v']:+.3f}")
    print(
        "Other-excluded sensitivity: "
        f"Cramer's V={no_other['cramers_v']:.3f}, "
        f"delta={summary['other_exclusion_sensitivity']['delta_cramers_v']:+.3f}"
    )
    print(f"Prefecture centroid classes: {summary['prefecture_centroid_bias']['centroid_terrain_class_counts']}")
    print(f"River sources: {summary['prefecture_gis_context']['river_source_counts']}")
    print(
        "Admin2 polygon context: "
        f"{summary['admin2_gis_context']['record_count']:,} records across "
        f"{summary['admin2_gis_context']['admin2_unit_count']:,} units"
    )
    print(f"Saved outputs: {args.output_dir}")


if __name__ == "__main__":
    main()

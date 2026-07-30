#!/usr/bin/env python3
"""Generate the final Crown Jewel evidence/support figure."""

from __future__ import annotations

import json
import textwrap
from pathlib import Path

import geopandas as gpd
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.lines import Line2D
from matplotlib.patches import Patch
from shapely.geometry import Point

import isprs_archive_language_v2 as language
import isprs_support_polygon_metrics as polygons


ROOT = Path(__file__).resolve().parents[2]
INPUT = ROOT / "data" / "nichibun" / "nichibun_enriched.json"
GADM = ROOT / "data" / "geo" / "gadm41_JPN_2.json"
RESULTS = ROOT / "analysis" / "isprs_yokai_geo_canonical" / "results.json"
OUTPUTS = (
    ROOT / "analysis" / "isprs_yokai_geo_canonical",
    ROOT / "paper" / "isprs-yokai-geo" / "figures",
)


def human_terms(row: dict[str, object]) -> list[str]:
    by_category = row["place_function_terms_by_category"]
    categories = row["human_condition_categories"]
    return list(
        dict.fromkeys(
            term
            for category in categories
            for term in by_category.get(category, [])
        )
    )


def human_label(value: str) -> str:
    return value.replace("_", " ").replace("waterside", "water-side")


def main() -> None:
    records = json.loads(INPUT.read_text(encoding="utf-8"))
    result = json.loads(RESULTS.read_text(encoding="utf-8"))
    record_id = result["crown_jewel_example"]["record_id"]
    source = next(
        row for row in records if str(row.get("id") or "") == record_id
    )
    language_rows, _audit = language.build_language_records([source])
    evidence_row = language_rows[0]
    supports = polygons.support_geometries(records, GADM)
    prefecture = str(source.get("prefecture") or "")
    municipality = str(source.get("_geocoded_place") or "")
    prefecture_support = supports[
        (supports["location_resolution"] == "prefecture")
        & (supports["prefecture"] == prefecture)
    ]
    municipality_support = supports[
        (supports["location_resolution"] == "municipality")
        & (supports["prefecture"] == prefecture)
        & (supports["municipality_candidate"] == municipality)
    ]
    if prefecture_support.empty or municipality_support.empty:
        raise ValueError("Example support geometry is missing")

    plt.rcParams.update(
        {
            "font.family": ["Meiryo", "DejaVu Sans"],
            "font.size": 10,
            "pdf.fonttype": 42,
            "figure.facecolor": "white",
            "axes.facecolor": "white",
        }
    )
    fig = plt.figure(figsize=(11.6, 6.5))
    grid = fig.add_gridspec(
        2,
        2,
        height_ratios=[0.9, 2.2],
        width_ratios=[1.5, 1.0],
        hspace=0.18,
        wspace=0.14,
    )
    header = fig.add_subplot(grid[0, :])
    header.axis("off")
    summary = " ".join(str(source.get("summary") or "").split())
    if len(summary) > 175:
        summary = summary[:174] + "…"
    header.text(
        0.01,
        0.95,
        "One record, separately inspectable evidence channels",
        fontsize=16,
        fontweight="bold",
        va="top",
    )
    header.text(
        0.01,
        0.63,
        (
            f"Record {record_id}  |  category "
            f"{source.get('major_category')}  |  {prefecture}  |  "
            f"support candidate {municipality}"
        ),
        fontsize=10.2,
        va="top",
    )
    header.text(
        0.01,
        0.38,
        textwrap.fill(summary, width=122),
        fontsize=9.4,
        va="top",
    )

    evidence = fig.add_subplot(grid[1, 0])
    evidence.axis("off")
    candidate_toponyms = ", ".join(
        evidence_row["candidate_toponym_mentions"]
    ) or "none detected"
    place_terms = ", ".join(
        evidence_row["place_function_terms"]
    ) or "none detected"
    condition_terms = ", ".join(human_terms(evidence_row)) or "none detected"
    interfaces = ", ".join(
        human_label(value)
        for value in evidence_row["strict_interface_types"]
    ) or "none derived"
    items = [
        ("Candidate toponym", candidate_toponyms, "#0072B2"),
        ("Non-toponymic place terms", place_terms, "#E69F00"),
        ("Human-condition terms", condition_terms, "#CC79A7"),
        ("Derived interface evidence", interfaces, "#009E73"),
        (
            "Support basis",
            (
                "rule-constrained unique present-day municipality-name "
                "match within the prefecture; current GADM 4.1 polygon"
            ),
            "#6B7280",
        ),
        (
            "Ambiguity retained",
            (
                "the display anchor is not an event location; extraction "
                "and municipality-match precision are not human-evaluated"
            ),
            "#D55E00",
        ),
    ]
    y = 0.99
    for label, value, colour in items:
        evidence.text(
            0.01,
            y,
            label,
            fontsize=10.4,
            fontweight="bold",
            color=colour,
            va="top",
        )
        evidence.text(
            0.32,
            y,
            textwrap.fill(value, width=55),
            fontsize=9.1,
            va="top",
        )
        y -= 0.165

    map_axis = fig.add_subplot(grid[1, 1])
    prefecture_support.boundary.plot(
        ax=map_axis, color="#6B7280", linewidth=1.4
    )
    municipality_support.plot(
        ax=map_axis,
        facecolor="#56B4E9",
        edgecolor="#0072B2",
        alpha=0.55,
        linewidth=1.4,
    )
    display_point = gpd.GeoSeries(
        [
            Point(
                float(source["_lng"]),
                float(source["_lat"]),
            )
        ],
        crs="EPSG:4326",
    ).to_crs(polygons.DISTANCE_CRS)
    map_axis.scatter(
        [display_point.iloc[0].x],
        [display_point.iloc[0].y],
        s=60,
        marker="x",
        linewidth=2.0,
        color="#D55E00",
        zorder=4,
    )
    map_axis.set_title(
        "Display anchor and evidential support areas",
        fontsize=11,
    )
    map_axis.set_axis_off()
    legend_handles = [
        Line2D(
            [0],
            [0],
            color="#6B7280",
            linewidth=1.5,
            label="Prefecture support",
        ),
        Patch(
            facecolor="#56B4E9",
            edgecolor="#0072B2",
            alpha=0.55,
            label="Municipality support",
        ),
        Line2D(
            [0],
            [0],
            marker="x",
            linestyle="none",
            markeredgewidth=2,
            color="#D55E00",
            label="Display anchor",
        ),
    ]
    map_axis.legend(
        handles=legend_handles,
        loc="lower left",
        fontsize=8.4,
        frameon=True,
    )
    for directory in OUTPUTS:
        directory.mkdir(parents=True, exist_ok=True)
        fig.savefig(
            directory / "fig1_crown_jewel.pdf", bbox_inches="tight"
        )
        fig.savefig(
            directory / "fig1_crown_jewel.png",
            dpi=300,
            bbox_inches="tight",
        )
    plt.close(fig)


if __name__ == "__main__":
    main()

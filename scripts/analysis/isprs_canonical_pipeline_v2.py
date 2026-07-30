#!/usr/bin/env python3
"""Run the single canonical analysis for the revised ISPRS manuscript.

All manuscript numbers, numeric tables, and analytical figures are generated
from ``results.json`` or CSV files written by this run. Human-gold extraction
metrics are intentionally absent because no manually annotated gold set is
available.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
import os
import platform
import subprocess
import sys
import time
from collections import Counter
from datetime import datetime, timezone
from importlib import metadata
from pathlib import Path
from typing import Any

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

import isprs_archive_language_v2 as language
import isprs_support_polygon_metrics as polygons


ROOT = Path(__file__).resolve().parents[2]
PAPER_DIR = ROOT / "paper" / "isprs-yokai-geo"
DEFAULT_INPUT = ROOT / "data" / "nichibun" / "nichibun_enriched.json"
DEFAULT_RAW = ROOT / "data" / "nichibun" / "nichibun_yokai_full.json"
DEFAULT_CLEAN_REPORT = (
    ROOT / "data" / "nichibun" / "nichibun_cleaned_report.json"
)
DEFAULT_OUTPUT = ROOT / "analysis" / "isprs_yokai_geo_canonical"
DEFAULT_GADM = ROOT / "data" / "geo" / "gadm41_JPN_2.json"
DEFAULT_RIVERS = ROOT / "data" / "geo" / "mlit_w05_rivers.geojson"
DEFAULT_LAKES = ROOT / "data" / "geo" / "ne_lakes.geojson"
DEFAULT_COAST = ROOT / "data" / "geo" / "ne_coastline.geojson"
SEED = 20260730

CATEGORY_LABELS = language.CATEGORY_LABELS
TEXT_FLAGS = ("mountain", "water", "coast", "boundary", "agrarian")
COLOURS = {
    "blue": "#0072B2",
    "orange": "#E69F00",
    "teal": "#009E73",
    "vermillion": "#D55E00",
    "purple": "#CC79A7",
    "grey": "#6B7280",
    "light": "#D1D5DB",
    "ink": "#202124",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--raw-input", type=Path, default=DEFAULT_RAW)
    parser.add_argument(
        "--clean-report", type=Path, default=DEFAULT_CLEAN_REPORT
    )
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--paper-dir", type=Path, default=PAPER_DIR)
    parser.add_argument("--gadm", type=Path, default=DEFAULT_GADM)
    parser.add_argument("--rivers", type=Path, default=DEFAULT_RIVERS)
    parser.add_argument("--lakes", type=Path, default=DEFAULT_LAKES)
    parser.add_argument("--coast", type=Path, default=DEFAULT_COAST)
    parser.add_argument("--seed", type=int, default=SEED)
    parser.add_argument(
        "--permutations", type=int, default=language.PERMUTATIONS
    )
    parser.add_argument(
        "--robustness-replicates",
        type=int,
        default=language.ROBUSTNESS_REPLICATES,
    )
    parser.add_argument(
        "--polygon-sample-size",
        type=int,
        default=polygons.SAMPLES_PER_SUPPORT,
    )
    return parser.parse_args()


def load_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def jsonable(value: Any) -> Any:
    if isinstance(value, dict):
        return {str(key): jsonable(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [jsonable(item) for item in value]
    if isinstance(value, Path):
        return str(value)
    if isinstance(value, np.generic):
        return value.item()
    if isinstance(value, float) and not math.isfinite(value):
        return None
    return value


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    with temporary.open("w", encoding="utf-8", newline="\n") as handle:
        json.dump(jsonable(payload), handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    os.replace(temporary, path)


def write_csv(
    path: Path,
    rows: list[dict[str, Any]],
    fields: list[str] | None = None,
) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if not rows:
        path.write_text("", encoding="utf-8")
        return
    fieldnames = fields or list(rows[0])
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(
            handle, fieldnames=fieldnames, extrasaction="ignore"
        )
        writer.writeheader()
        writer.writerows(jsonable(rows))


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def git_output(*args: str) -> str:
    try:
        return subprocess.check_output(
            ["git", *args],
            cwd=ROOT,
            text=True,
            encoding="utf-8",
            errors="replace",
        ).strip()
    except (OSError, subprocess.CalledProcessError):
        return "TODO-AUTHOR"


def package_versions() -> dict[str, str]:
    names = [
        "ginza",
        "ja-ginza",
        "spacy",
        "geopandas",
        "shapely",
        "pyproj",
        "pandas",
        "numpy",
        "matplotlib",
        "requests",
        "scipy",
    ]
    output: dict[str, str] = {}
    for name in names:
        try:
            output[name] = metadata.version(name)
        except metadata.PackageNotFoundError:
            output[name] = "not-installed"
    return output


def finite(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def percent(count: int, total: int) -> float:
    return round(count / max(1, total) * 100.0, 1)


def configure_plots() -> None:
    plt.rcParams.update(
        {
            "font.family": "DejaVu Sans",
            "font.size": 10,
            "axes.titlesize": 11,
            "axes.labelsize": 10,
            "xtick.labelsize": 9,
            "ytick.labelsize": 9,
            "axes.spines.top": False,
            "axes.spines.right": False,
            "axes.grid": True,
            "grid.alpha": 0.18,
            "grid.linewidth": 0.7,
            "figure.facecolor": "white",
            "axes.facecolor": "white",
            "savefig.bbox": "tight",
        }
    )


def save_figure(
    fig: Any, output_dir: Path, paper_dir: Path, stem: str
) -> None:
    for directory in (output_dir, paper_dir / "figures"):
        directory.mkdir(parents=True, exist_ok=True)
        fig.savefig(directory / f"{stem}.pdf")
        fig.savefig(directory / f"{stem}.png", dpi=300)
    plt.close(fig)


def text_landscape_counts(
    records: list[dict[str, Any]]
) -> dict[str, int]:
    counts = {
        "any_textual_landscape_mention": 0,
        **{f"text_mentions_{flag}": 0 for flag in TEXT_FLAGS},
    }
    for record in records:
        categories = set(record.get("_terrain_term_categories") or [])
        present = categories & set(TEXT_FLAGS)
        counts["any_textual_landscape_mention"] += int(bool(present))
        for flag in TEXT_FLAGS:
            counts[f"text_mentions_{flag}"] += int(flag in categories)
    return counts


def municipality_match_audit(
    records: list[dict[str, Any]]
) -> dict[str, Any]:
    selected = [
        row for row in records if row.get("_geo_level") == "municipality"
    ]
    unique: dict[tuple[str, str], dict[str, Any]] = {}
    for row in selected:
        key = (
            str(row.get("_pref_gadm_name") or ""),
            str(row.get("_admin2_context_name_en") or ""),
        )
        unique.setdefault(key, row)
    return {
        "matched_records": len(selected),
        "unique_matched_units": len(unique),
        "method_record_counts": dict(
            Counter(str(row.get("_geocode_method") or "unknown") for row in selected)
        ),
        "municipality_type_record_counts": dict(
            Counter(str(row.get("_admin2_type") or "unknown") for row in selected)
        ),
        "municipality_type_unit_counts": dict(
            Counter(
                str(row.get("_admin2_type") or "unknown")
                for row in unique.values()
            )
        ),
        "allowed_municipality_like_types": [
            "Shi",
            "Machi",
            "Mura",
            "SpecialWard",
            "Capital",
            "Son",
        ],
        "japanese_name_field": "NL_NAME_2",
        "english_context_field": "NAME_2",
        "matching_scope": (
            "unique exact normalized name within the record's prefecture"
        ),
        "method_precedence": (
            "direct summary match first; NER match only when direct matching "
            "did not assign a unit"
        ),
        "manual_validation": False,
    }


def attach_source_groups(
    raw_records: list[dict[str, Any]],
    language_records: list[dict[str, Any]],
) -> dict[str, Any]:
    raw_by_id = {str(row.get("id") or ""): row for row in raw_records}
    usable = 0
    malformed = 0
    for row in language_records:
        raw = raw_by_id.get(row["record_id"])
        title = str((raw or {}).get("paper_title") or "").strip()
        if not title or title.startswith("■"):
            row["source_group"] = "unknown"
            malformed += 1
        else:
            row["source_group"] = title
            usable += 1
    return {
        "raw_records": len(raw_records),
        "joined_language_records": usable + malformed,
        "usable_source_group_records": usable,
        "unusable_or_missing_source_group_records": malformed,
        "source_document_blocking_used": False,
        "reason_not_used": (
            "source fields are missing or malformed for part of the local "
            "scrape; prefecture-stratified results are therefore primary"
        ),
    }


def plot_evidence_coverage(
    counts: dict[str, int],
    total: int,
    output_dir: Path,
    paper_dir: Path,
) -> None:
    labels = [
        "Candidate toponym",
        "Place description",
        "Human condition",
        "Broad interface",
        "Strict interface",
    ]
    keys = [
        "candidate_toponym_mentions",
        "place_description_evidence",
        "human_condition_evidence",
        "broad_human_environment_interface",
        "strict_interface_evidence",
    ]
    values = [counts[key] / total * 100.0 for key in keys]
    colours = [
        COLOURS["blue"],
        COLOURS["orange"],
        COLOURS["purple"],
        COLOURS["teal"],
        COLOURS["grey"],
    ]
    fig, ax = plt.subplots(figsize=(7.4, 4.2))
    positions = np.arange(len(labels))
    bars = ax.barh(
        positions, values, color=colours, edgecolor=COLOURS["ink"], linewidth=0.5
    )
    ax.set_yticks(positions, labels)
    ax.set_xlabel("Records containing the evidence channel (%)")
    ax.set_title(
        "Evidence-channel coverage",
        loc="left",
        fontweight="bold",
    )
    ax.text(
        0,
        1.02,
        f"Rule-based coverage among {total:,} archive records; not accuracy",
        transform=ax.transAxes,
        fontsize=9,
        color=COLOURS["grey"],
    )
    ax.set_xlim(0, max(values) * 1.24)
    ax.invert_yaxis()
    for bar, value, key in zip(bars, values, keys):
        ax.text(
            value + 0.6,
            bar.get_y() + bar.get_height() / 2,
            f"{counts[key]:,} ({value:.1f}%)",
            va="center",
            fontsize=9,
        )
    fig.tight_layout()
    save_figure(fig, output_dir, paper_dir, "fig2_evidence_coverage")


def plot_resolution_sensitivity(
    comparisons: list[dict[str, Any]],
    output_dir: Path,
    paper_dir: Path,
) -> None:
    series = [
        (
            "Support-area reduction (%)",
            "support_area_reduction_percent",
            COLOURS["blue"],
        ),
        (
            "Absolute change in sampled median\ncoast distance (km)",
            "change_sample_median_distance_to_coast_km",
            COLOURS["orange"],
        ),
        (
            "Absolute change in sampled median\nmajor-water distance (km)",
            "change_sample_median_distance_to_major_water_km",
            COLOURS["teal"],
        ),
    ]
    fig, axes = plt.subplots(1, 3, figsize=(10.5, 3.7))
    for axis, (label, key, colour) in zip(axes, series):
        values = np.asarray(
            [
                abs(float(row[key]))
                if key.startswith("change_")
                else float(row[key])
                for row in comparisons
                if finite(row.get(key)) is not None
            ],
            dtype=float,
        )
        parts = axis.violinplot(
            values,
            positions=[0],
            showmeans=False,
            showmedians=False,
            showextrema=False,
            widths=0.75,
        )
        for body in parts["bodies"]:
            body.set_facecolor(colour)
            body.set_edgecolor(COLOURS["ink"])
            body.set_alpha(0.55)
        q25, median_value, q75 = np.quantile(values, [0.25, 0.5, 0.75])
        axis.vlines(0, q25, q75, color=COLOURS["ink"], linewidth=4)
        axis.scatter(
            [0],
            [median_value],
            color="white",
            edgecolor=COLOURS["ink"],
            s=34,
            zorder=4,
        )
        axis.set_xticks([])
        axis.set_ylabel(label)
        axis.text(
            0.5,
            0.97,
            f"median {median_value:.1f}",
            transform=axis.transAxes,
            ha="center",
            va="top",
            fontsize=9,
        )
        axis.grid(axis="x", visible=False)
    fig.suptitle(
        "Administrative-support refinement diagnostics",
        x=0.06,
        ha="left",
        fontsize=12,
        fontweight="bold",
    )
    fig.text(
        0.06,
        0.92,
        (
            f"{len(comparisons):,} uniquely matched municipality support "
            "polygons compared with their prefecture supports"
        ),
        fontsize=9,
        color=COLOURS["grey"],
    )
    fig.tight_layout(rect=[0, 0, 1, 0.88])
    save_figure(fig, output_dir, paper_dir, "fig3_resolution_sensitivity")


def plot_archive_language_effects(
    focal: list[dict[str, Any]],
    output_dir: Path,
    paper_dir: Path,
) -> None:
    rows = list(focal)
    labels = [
        f"{row['category_label']} — {row['feature_label']}" for row in rows
    ]
    y = np.arange(len(rows))[::-1]
    fig, ax = plt.subplots(figsize=(8.2, 4.9))
    for position, row in zip(y, rows):
        colour = (
            COLOURS["blue"]
            if row["analysis_role"] == "construct check"
            else COLOURS["orange"]
        )
        marker = "o" if row["analysis_role"] == "construct check" else "s"
        value = float(row["odds_ratio"])
        low = float(row["odds_ratio_ci_low"])
        high = float(row["odds_ratio_ci_high"])
        ax.errorbar(
            value,
            position,
            xerr=[[value - low], [high - value]],
            fmt=marker,
            color=colour,
            markeredgecolor=COLOURS["ink"],
            markeredgewidth=0.5,
            capsize=2.5,
            markersize=6,
        )
    ax.axvline(1, color=COLOURS["ink"], linestyle="--", linewidth=1)
    ax.set_xscale("log")
    ax.set_yticks(y, labels)
    ax.set_xlabel("Odds ratio with 95% interval (log scale)")
    ax.set_title(
        "Prefecture-stratified archive-language associations",
        loc="left",
        fontweight="bold",
    )
    ax.text(
        0,
        1.02,
        (
            "Blue circles: construct checks; orange squares: exploratory "
            "screens; multiplicity-adjusted q-values are reported in Table 3"
        ),
        transform=ax.transAxes,
        fontsize=8.8,
        color=COLOURS["grey"],
    )
    fig.tight_layout()
    save_figure(fig, output_dir, paper_dir, "fig4_archive_language_effects")


def choose_crown_jewel(
    source_records: list[dict[str, Any]],
    language_records: list[dict[str, Any]],
    support_rows: Any,
) -> tuple[dict[str, Any], dict[str, Any]]:
    support_keys = {
        (str(row["prefecture"]), str(row["municipality_candidate"]))
        for _, row in support_rows[
            support_rows["location_resolution"] == "municipality"
        ].iterrows()
    }
    source_by_id = {
        str(row.get("id") or ""): row for row in source_records
    }
    candidates = []
    for row in language_records:
        source = source_by_id[row["record_id"]]
        key = (
            str(source.get("prefecture") or ""),
            str(source.get("_geocoded_place") or ""),
        )
        if (
            source.get("_geo_level") != "municipality"
            or key not in support_keys
            or not row["candidate_toponym_mentions"]
        ):
            continue
        score = (
            int(row["major_category"] != "その他"),
            int(row["has_strict_boundary_interface"]),
            int(row["has_human_condition"]),
            len(row["place_function_terms"]),
        )
        candidates.append((score, row["record_id"], source, row))
    if not candidates:
        raise ValueError("No suitable crown-jewel example found")
    candidates.sort(key=lambda item: (item[0], item[1]), reverse=True)
    return candidates[0][2], candidates[0][3]


def tex_escape(value: Any) -> str:
    text = str(value)
    replacements = {
        "\\": r"\textbackslash{}",
        "&": r"\&",
        "%": r"\%",
        "$": r"\$",
        "#": r"\#",
        "_": r"\_",
        "{": r"\{",
        "}": r"\}",
        "~": r"\textasciitilde{}",
        "^": r"\textasciicircum{}",
    }
    return "".join(replacements.get(character, character) for character in text)


def macro(name: str, value: Any) -> str:
    return rf"\newcommand{{\{name}}}{{{value}}}"


def focal_by_key(
    focal: list[dict[str, Any]], category: str, feature: str
) -> dict[str, Any]:
    return next(
        row
        for row in focal
        if row["major_category"] == category and row["feature"] == feature
    )


def write_generated_numbers(
    paper_dir: Path, results: dict[str, Any]
) -> None:
    archive = results["archive"]
    channels = results["evidence_channels"]
    polygon_summary = results["resolution_sensitivity"]["polygon_summary"]
    kappa = results["archive_language"]["kappa_water_distance_diagnostic"]
    focal = results["archive_language"]["focal_associations"]
    kappa_water = focal_by_key(focal, "カッパ", "hydrology")
    yurei_death = focal_by_key(focal, "ユウレイ", "death_ritual")
    snake_boundary = focal_by_key(
        focal, "ヘビ・リュウ", "strict_boundary_interface"
    )
    lines = [
        "% Generated by scripts/analysis/isprs_canonical_pipeline_v2.py",
        macro("ArchiveRecords", f"{archive['cleaned_records']:,}"),
        macro("RawArchiveRecords", f"{archive['raw_records']:,}"),
        macro("ExcludedArchiveRecords", f"{archive['excluded_records']:,}"),
        macro(
            "PrefectureAnchorRecords",
            f"{archive['location_resolution_record_counts']['prefecture']:,}",
        ),
        macro(
            "MunicipalityAnchorRecords",
            f"{archive['location_resolution_record_counts']['municipality']:,}",
        ),
        macro(
            "MunicipalitySupportUnits",
            f"{polygon_summary['support_units_by_resolution']['municipality']:,}",
        ),
        macro(
            "CandidateToponymCount",
            f"{channels['counts']['candidate_toponym_mentions']:,}",
        ),
        macro(
            "CandidateToponymPercent",
            f"{channels['percent']['candidate_toponym_mentions']:.1f}",
        ),
        macro(
            "PlaceDescriptionCount",
            f"{channels['counts']['place_description_evidence']:,}",
        ),
        macro(
            "PlaceDescriptionPercent",
            f"{channels['percent']['place_description_evidence']:.1f}",
        ),
        macro(
            "HumanConditionCount",
            f"{channels['counts']['human_condition_evidence']:,}",
        ),
        macro(
            "HumanConditionPercent",
            f"{channels['percent']['human_condition_evidence']:.1f}",
        ),
        macro(
            "BroadInterfaceCount",
            f"{channels['counts']['broad_human_environment_interface']:,}",
        ),
        macro(
            "BroadInterfacePercent",
            f"{channels['percent']['broad_human_environment_interface']:.1f}",
        ),
        macro(
            "StrictInterfaceCount",
            f"{channels['counts']['strict_interface_evidence']:,}",
        ),
        macro(
            "StrictInterfacePercent",
            f"{channels['percent']['strict_interface_evidence']:.1f}",
        ),
        macro(
            "MedianAreaReduction",
            (
                f"{polygon_summary['support_area_reduction_percent']['median']:.1f}"
            ),
        ),
        macro(
            "MedianCoastSensitivity",
            (
                f"{polygon_summary['absolute_change_sample_median_distance_to_coast_km']['median']:.1f}"
            ),
        ),
        macro(
            "MedianWaterSensitivity",
            (
                f"{polygon_summary['absolute_change_sample_median_distance_to_major_water_km']['median']:.1f}"
            ),
        ),
        macro("PermutationCount", f"{results['configuration']['permutations']:,}"),
        macro(
            "RobustnessReplicates",
            f"{results['configuration']['robustness_replicates']}",
        ),
        macro(
            "KappaWaterObservedPercent",
            f"{kappa_water['observed_prevalence'] * 100:.1f}",
        ),
        macro(
            "KappaWaterNullPercent",
            f"{kappa_water['null_median_prevalence'] * 100:.1f}",
        ),
        macro("KappaWaterOR", f"{kappa_water['odds_ratio']:.2f}"),
        macro("KappaWaterQ", f"{kappa_water['benjamini_hochberg_q']:.4f}"),
        macro(
            "YureiDeathObservedPercent",
            f"{yurei_death['observed_prevalence'] * 100:.1f}",
        ),
        macro(
            "YureiDeathNullPercent",
            f"{yurei_death['null_median_prevalence'] * 100:.1f}",
        ),
        macro("YureiDeathOR", f"{yurei_death['odds_ratio']:.2f}"),
        macro("YureiDeathQ", f"{yurei_death['benjamini_hochberg_q']:.4f}"),
        macro("SnakeBoundaryOR", f"{snake_boundary['odds_ratio']:.2f}"),
        macro(
            "SnakeBoundaryQ",
            f"{snake_boundary['benjamini_hochberg_q']:.4f}",
        ),
        macro(
            "KappaDistanceObserved",
            f"{kappa['observed_median_km']:.3f}",
        ),
        macro(
            "KappaDistanceNull",
            f"{kappa['null_distribution_median_km']:.3f}",
        ),
        macro(
            "KappaDistanceOneSidedP",
            f"{kappa['one_sided_p_smaller']:.4f}",
        ),
        macro(
            "KappaDistanceTwoSidedP",
            f"{kappa['two_sided_p']:.4f}",
        ),
    ]
    (paper_dir / "generated_numbers.tex").write_text(
        "\n".join(lines) + "\n", encoding="utf-8"
    )


def write_generated_tables(
    paper_dir: Path, results: dict[str, Any]
) -> None:
    channels = results["evidence_channels"]
    total = results["archive"]["cleaned_records"]
    channel_rows = [
        ("Candidate toponym", "candidate_toponym_mentions"),
        ("Non-toponymic place description", "place_description_evidence"),
        ("Human condition", "human_condition_evidence"),
        (
            "Broad human--environment interface",
            "broad_human_environment_interface",
        ),
        ("Strict derived interface", "strict_interface_evidence"),
    ]
    channel_body = "\n".join(
        (
            f"{tex_escape(label)} & "
            f"{channels['counts'][key]:,} & "
            f"{channels['percent'][key]:.1f}\\% \\\\"
        )
        for label, key in channel_rows
    )
    channel_table = rf"""
\begin{{table}}[t]
\centering
\caption{{Coverage of separately represented evidence channels. Counts are
rule-based coverage, not extraction accuracy; channels are non-exclusive.
The denominator is {total:,} records.}}
\label{{tab:channels}}
\begin{{tabular}}{{lrr}}
\hline
Evidence channel & Records & Share \\
\hline
{channel_body}
\hline
\end{{tabular}}
\end{{table}}
""".lstrip()

    summary = results["resolution_sensitivity"]["polygon_summary"]
    comparison_rows = [
        (
            "Support-area reduction (\\%)",
            summary["support_area_reduction_percent"],
        ),
        (
            "Absolute change in sampled median coast distance (km)",
            summary[
                "absolute_change_sample_median_distance_to_coast_km"
            ],
        ),
        (
            "Absolute change in sampled median major-water distance (km)",
            summary[
                "absolute_change_sample_median_distance_to_major_water_km"
            ],
        ),
    ]
    resolution_body = "\n".join(
        (
            f"{label} & {values['n']:,} & "
            f"{values['median']:.1f} & "
            f"{values['q25']:.1f}--{values['q75']:.1f} \\\\"
        )
        for label, values in comparison_rows
    )
    resolution_table = rf"""
\begin{{table}}[t]
\centering
\caption{{Resolution sensitivity for uniquely matched municipality support
polygons relative to their prefecture support polygons. Distances summarize
128 deterministic area-uniform sample points per support; they are not errors
against event-location ground truth.}}
\label{{tab:resolution}}
\begin{{tabular}}{{lrrr}}
\hline
Metric & $n$ & Median & IQR \\
\hline
{resolution_body}
\hline
\end{{tabular}}
\end{{table}}
""".lstrip()

    focal = results["archive_language"]["focal_associations"]
    association_body = "\n".join(
        (
            f"{tex_escape(row['category_label'])} & "
            f"{tex_escape(row['feature_label'])} & "
            f"{row['observed_prevalence'] * 100:.1f} & "
            f"{row['null_median_prevalence'] * 100:.1f} & "
            f"{row['observed_to_null_ratio']:.2f} & "
            f"{row['odds_ratio']:.2f} "
            f"[{row['odds_ratio_ci_low']:.2f}, "
            f"{row['odds_ratio_ci_high']:.2f}] & "
            f"{row['benjamini_hochberg_q']:.4f} \\\\"
        )
        for row in focal
    )
    association_table = rf"""
\begin{{table*}}[t]
\centering
\caption{{Prefecture-stratified archive-language associations. ``Null'' is
the median prevalence under 10,000 within-prefecture label permutations.
$q$ is the Benjamini--Hochberg-adjusted two-sided empirical value across the
screened category--feature cells. Kappa--water and Yurei--death are construct
checks; the remaining rows are exploratory screens.}}
\label{{tab:associations}}
\begin{{tabular}}{{llrrrrr}}
\hline
Category & Feature & Obs. \% & Null \% & O/E & OR [95\% CI] & $q$ \\
\hline
{association_body}
\hline
\end{{tabular}}
\end{{table*}}
""".lstrip()

    robustness = results["archive_language"]["robustness"]
    rank_body = "\n".join(
        (
            f"{row['drop_rate'] * 100:.0f}\\% & "
            f"{row['replicates']} & "
            f"{row['rank_correlation_median']:.3f} & "
            f"{row['rank_correlation_q25']:.3f}--"
            f"{row['rank_correlation_q75']:.3f} & "
            f"{row['rank_correlation_min']:.3f}--"
            f"{row['rank_correlation_max']:.3f} \\\\"
        )
        for row in robustness["rank_correlation_summary"]
    )
    robustness_table = rf"""
\begin{{table}}[t]
\centering
\caption{{Dictionary-deletion robustness over 100 deterministic replicates
per deletion rate. Spearman rank correlation compares all finite
category--feature effect ratios with the full-dictionary ordering.}}
\label{{tab:robustness}}
\begin{{tabular}}{{rrrrr}}
\hline
Deletion & Runs & Median $\rho$ & IQR & Min--max \\
\hline
{rank_body}
\hline
\end{{tabular}}
\end{{table}}
""".lstrip()

    ablation_body = "\n".join(
        (
            f"{tex_escape(row['definition'])} & "
            f"{row['snake_dragon_effect_ratio']:.2f} \\\\"
        )
        for row in robustness["interface_definition_ablation"]
    )
    ablation_table = rf"""
\begin{{table}}[t]
\centering
\caption{{Interface-definition ablation for the exploratory
Snake/Dragon--boundary association. Construct-check rows are not repeated
because the ablation does not alter their feature definitions.}}
\label{{tab:interface-ablation}}
\begin{{tabular}}{{lr}}
\hline
Boundary-interface definition & O/E ratio \\
\hline
{ablation_body}
\hline
\end{{tabular}}
\end{{table}}
""".lstrip()

    outputs = {
        "generated_table_channels.tex": channel_table,
        "generated_table_resolution.tex": resolution_table,
        "generated_table_associations.tex": association_table,
        "generated_table_robustness.tex": robustness_table,
        "generated_table_interface_ablation.tex": ablation_table,
    }
    for name, content in outputs.items():
        (paper_dir / name).write_text(content, encoding="utf-8")


def flatten_number_map(
    value: Any,
    *,
    path: str = "",
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    if isinstance(value, dict):
        for key, child in value.items():
            child_path = f"{path}.{key}" if path else str(key)
            rows.extend(flatten_number_map(child, path=child_path))
    elif isinstance(value, list):
        for index, child in enumerate(value):
            rows.extend(
                flatten_number_map(child, path=f"{path}[{index}]")
            )
    elif isinstance(value, (int, float)) and not isinstance(value, bool):
        rows.append(
            {
                "reported_quantity": path,
                "value": value,
                "source_file": "results.json",
                "json_path": path,
            }
        )
    return rows


def run(args: argparse.Namespace) -> dict[str, Any]:
    started = time.perf_counter()
    source = load_json(args.input)
    raw = load_json(args.raw_input)
    clean_report = load_json(args.clean_report)
    if not isinstance(source, list) or not isinstance(raw, list):
        raise ValueError("Record inputs must be JSON lists")

    language_records, language_audit = language.build_language_records(source)
    source_group_audit = attach_source_groups(raw, language_records)
    channel_counts = language.evidence_channel_counts(language_records)
    total = len(source)
    if channel_counts["broad_human_environment_interface"] > channel_counts[
        "human_condition_evidence"
    ]:
        raise AssertionError("Invalid interface subset relationship")

    associations = language.association_table(
        language_records, args.permutations, args.seed
    )
    focal = language.select_focal_associations(associations)
    examples = language.qualitative_examples(language_records, focal)
    kappa_distance = language.kappa_water_distance_diagnostic(
        source, args.permutations, args.seed + 700_000
    )
    robustness = language.robustness_diagnostics(
        language_records, args.seed + 900_000, args.robustness_replicates
    )
    dictionary = language.dictionary_manifest()

    polygon_output = polygons.build_support_metrics(
        source,
        gadm_path=args.gadm,
        river_path=args.rivers,
        lake_path=args.lakes,
        coastline_path=args.coast,
        seed=args.seed,
        sample_size=args.polygon_sample_size,
    )
    polygon_summary = jsonable(polygon_output["summary"])
    polygon_summary["support_units_by_resolution"] = {
        key: int(value)
        for key, value in polygon_summary[
            "support_units_by_resolution"
        ].items()
    }

    resolution_counts = Counter(
        str(row.get("_geo_level") or "unknown") for row in source
    )
    landscape_counts = text_landscape_counts(source)
    match_audit = municipality_match_audit(source)
    results = {
        "claim": (
            "This work represents vague folklore locations through separate "
            "evidence channels for administrative support, candidate "
            "toponyms, non-toponymic place descriptions, geographic context, "
            "human conditions, derived interfaces, and provenance, and shows "
            "how geographic summaries change when administrative support is "
            "refined without treating display anchors as event locations."
        ),
        "title": (
            "From Point Anchors to Geospatial Support: A Resolution-Aware "
            "Representation of Toponymic and Non-Toponymic Place Evidence in "
            "a Japanese Yokai Archive"
        ),
        "configuration": {
            "seed": args.seed,
            "permutations": args.permutations,
            "robustness_replicates": args.robustness_replicates,
            "polygon_sample_points_per_support": args.polygon_sample_size,
            "distance_crs": polygons.DISTANCE_CRS,
            "coast_thresholds_km": list(polygons.COAST_THRESHOLDS_KM),
            "river_thresholds_km": list(polygons.RIVER_THRESHOLDS_KM),
            "water_thresholds_km": list(polygons.WATER_THRESHOLDS_KM),
            "exclusive_terrain_class_in_primary_analysis": False,
            "manual_gold_evaluation": False,
        },
        "archive": {
            "raw_records": int(clean_report["input_total"]),
            "cleaned_records": total,
            "excluded_records": int(clean_report["input_total"]) - total,
            "dropped_short_summary": int(
                clean_report["dropped_short_summary"]
            ),
            "dropped_other_region": int(
                clean_report["dropped_other_region"]
            ),
            "minimum_summary_characters": int(
                clean_report["min_summary_len"]
            ),
            "location_resolution_record_counts": dict(resolution_counts),
            "municipality_matching": match_audit,
            "source_group_audit": source_group_audit,
        },
        "evidence_channels": {
            "counts": channel_counts,
            "percent": {
                key: percent(value, total)
                for key, value in channel_counts.items()
            },
            "textual_landscape_counts": landscape_counts,
            "textual_landscape_percent": {
                key: percent(value, total)
                for key, value in landscape_counts.items()
            },
            "broad_interface_set_definition": (
                "(hydrology or livelihood or water/mountain/coast textual "
                "mention) AND (actor or action or taboo/time/weather term)"
            ),
            "subset_assertion_passed": True,
            "legacy_admin2_or_boundary_interface_removed": True,
            "extraction_evaluation": {
                "human_gold_labels_available": False,
                "precision_recall_f1_reported": False,
                "terminology": (
                    "candidate toponym mentions and rule-based coverage"
                ),
            },
            "language_extraction_audit": language_audit,
        },
        "resolution_sensitivity": {
            "polygon_summary": polygon_summary,
            "threshold_sensitivity_file": "threshold_sensitivity.csv",
            "support_metrics_file": "support_polygon_metrics.csv",
            "refinement_comparison_file": (
                "support_refinement_comparison.csv"
            ),
            "interpretation": (
                "changes under administrative-support refinement, not "
                "corrections against event-location ground truth"
            ),
        },
        "archive_language": {
            "focal_associations": focal,
            "full_association_file": "archive_language_associations.csv",
            "qualitative_examples_file": "qualitative_examples.csv",
            "permutation_block": "prefecture",
            "kappa_water_distance_diagnostic": kappa_distance,
            "robustness": {
                "replicates_per_drop_rate": robustness[
                    "replicates_per_drop_rate"
                ],
                "seed": robustness["seed"],
                "mask_audit": robustness["mask_audit"],
                "name_masking": robustness["name_masking"],
                "dictionary_drop_summary": robustness[
                    "dictionary_drop_summary"
                ],
                "rank_correlation_summary": robustness[
                    "rank_correlation_summary"
                ],
                "interface_definition_ablation": robustness[
                    "interface_definition_ablation"
                ],
                "replicate_files": {
                    "dictionary_deletion": (
                        "dictionary_deletion_replicates.csv"
                    ),
                    "rank_correlation": (
                        "dictionary_rank_correlation_replicates.csv"
                    ),
                },
            },
            "scope": (
                "archive-language associations and construct checks; not "
                "physical ecological relationships"
            ),
        },
        "dictionary": dictionary,
        "claims_not_supported": [
            "candidate-toponym or place-description extraction accuracy",
            "municipality-match precision",
            "exact event locations",
            "physical ecological relationships",
            "local terrain conditions for prefecture-supported records",
            "historical diffusion from Kyoto",
            "causal or population-prevalence claims about Japanese folklore",
        ],
    }

    args.output_dir.mkdir(parents=True, exist_ok=True)
    args.paper_dir.mkdir(parents=True, exist_ok=True)
    write_json(args.output_dir / "results.json", results)
    write_json(args.output_dir / "dictionary_manifest.json", dictionary)
    write_csv(
        args.output_dir / "archive_language_associations.csv", associations
    )
    write_csv(args.output_dir / "focal_associations.csv", focal)
    write_csv(args.output_dir / "qualitative_examples.csv", examples)
    write_csv(
        args.output_dir / "dictionary_deletion_replicates.csv",
        robustness["dictionary_drop_replicates"],
    )
    write_csv(
        args.output_dir / "dictionary_rank_correlation_replicates.csv",
        robustness["rank_correlation_replicates"],
    )
    write_csv(
        args.output_dir / "support_polygon_metrics.csv",
        polygon_output["metric_rows"],
    )
    write_csv(
        args.output_dir / "support_refinement_comparison.csv",
        polygon_output["comparisons"],
    )
    write_csv(
        args.output_dir / "threshold_sensitivity.csv",
        polygon_output["threshold_sensitivity"],
    )
    write_csv(
        args.output_dir / "evidence_channel_records.csv",
        [
            {
                "record_id": row["record_id"],
                "major_category": row["major_category"],
                "prefecture": row["prefecture"],
                "has_candidate_toponym": row["has_candidate_toponym"],
                "has_place_description": row["has_place_description"],
                "has_human_condition": row["has_human_condition"],
                "has_broad_interface": row["has_broad_interface"],
                "has_strict_interface": row["has_strict_interface"],
                "has_strict_boundary_interface": row[
                    "has_strict_boundary_interface"
                ],
            }
            for row in language_records
        ],
    )
    write_csv(
        args.output_dir / "number_source_map.csv",
        flatten_number_map(results),
    )

    configure_plots()
    plot_evidence_coverage(
        channel_counts, total, args.output_dir, args.paper_dir
    )
    plot_resolution_sensitivity(
        polygon_output["comparisons"], args.output_dir, args.paper_dir
    )
    plot_archive_language_effects(
        focal, args.output_dir, args.paper_dir
    )
    crown_source, crown_language = choose_crown_jewel(
        source, language_records, polygon_output["supports"]
    )
    for directory in (
        args.output_dir,
        args.paper_dir / "figures",
    ):
        polygons.plot_crown_jewel(
            crown_source,
            crown_language,
            polygon_output["supports"],
            directory / "fig1_crown_jewel.pdf",
            directory / "fig1_crown_jewel.png",
        )
    results["crown_jewel_example"] = {
        "record_id": str(crown_source.get("id") or ""),
        "major_category": str(crown_source.get("major_category") or ""),
        "prefecture": str(crown_source.get("prefecture") or ""),
        "municipality_candidate": str(
            crown_source.get("_geocoded_place") or ""
        ),
    }
    write_json(args.output_dir / "results.json", results)
    write_csv(
        args.output_dir / "number_source_map.csv",
        flatten_number_map(results),
    )
    write_generated_numbers(args.paper_dir, results)
    write_generated_tables(args.paper_dir, results)

    elapsed = time.perf_counter() - started
    input_paths = {
        "enriched_records": args.input,
        "raw_archive_scrape": args.raw_input,
        "cleaning_report": args.clean_report,
        "gadm_admin2": args.gadm,
        "mlit_w05_rivers": args.rivers,
        "natural_earth_lakes": args.lakes,
        "natural_earth_coastline": args.coast,
        "canonical_pipeline": Path(__file__).resolve(),
        "archive_language_module": (
            Path(language.__file__).resolve()
        ),
        "polygon_metrics_module": Path(polygons.__file__).resolve(),
    }
    output_names = [
        "results.json",
        "dictionary_manifest.json",
        "archive_language_associations.csv",
        "focal_associations.csv",
        "qualitative_examples.csv",
        "dictionary_deletion_replicates.csv",
        "dictionary_rank_correlation_replicates.csv",
        "support_polygon_metrics.csv",
        "support_refinement_comparison.csv",
        "threshold_sensitivity.csv",
        "evidence_channel_records.csv",
        "number_source_map.csv",
        "fig1_crown_jewel.pdf",
        "fig2_evidence_coverage.pdf",
        "fig3_resolution_sensitivity.pdf",
        "fig4_archive_language_effects.pdf",
    ]
    manifest = {
        "run_timestamp_utc": datetime.now(timezone.utc).isoformat(),
        "git_commit": git_output("rev-parse", "HEAD"),
        "git_tracked_worktree_dirty": bool(
            git_output(
                "status", "--porcelain", "--untracked-files=no"
            )
        ),
        "command": " ".join([sys.executable, *sys.argv]),
        "input_files": {
            name: {
                "path": str(path.resolve()),
                "sha256": sha256(path),
            }
            for name, path in input_paths.items()
        },
        "configuration": results["configuration"],
        "dictionary_version": dictionary["dictionary_version"],
        "dictionary_sha256": dictionary["sha256"],
        "random_seeds": {
            "base": args.seed,
            "permutation_cells": (
                "base + category_index*1000 + feature_index"
            ),
            "kappa_distance": args.seed + 700_000,
            "dictionary_robustness": args.seed + 900_000,
            "polygon_sampling": args.seed,
        },
        "python_version": sys.version,
        "node_version": "TODO-AUTHOR: interface build not executed in this run",
        "package_versions": package_versions(),
        "environment": {
            "platform": platform.platform(),
            "processor": platform.processor() or "not-reported",
            "logical_cpu_count": os.cpu_count(),
            "hardware_memory": "TODO-AUTHOR",
        },
        "execution_seconds": round(elapsed, 3),
        "expected_outputs": output_names,
        "output_sha256": {
            name: sha256(args.output_dir / name)
            for name in output_names
            if (args.output_dir / name).exists()
        },
        "code_license": "TODO-AUTHOR",
        "derived_data_license": "TODO-AUTHOR",
    }
    write_json(args.output_dir / "run_manifest.json", manifest)
    return results


def main() -> None:
    args = parse_args()
    results = run(args)
    print(
        json.dumps(
            {
                "records": results["archive"]["cleaned_records"],
                "evidence_channels": results["evidence_channels"],
                "polygon_summary": results["resolution_sensitivity"][
                    "polygon_summary"
                ],
                "crown_jewel_example": results["crown_jewel_example"],
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()

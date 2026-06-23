#!/usr/bin/env python3
"""Build a folklore spatial-support representation for Nichibun records.

The spatial support model keeps point coordinates available for mapping, but
does not treat the point as the whole claim. Each record receives explicit
administrative, toponym, terrain, place-function, textual, and source supports.
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import os
import re
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

import matplotlib.pyplot as plt
import numpy as np


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_INPUT = ROOT / "data" / "nichibun" / "nichibun_enriched.json"
DEFAULT_OUTPUT = ROOT / "data" / "nichibun" / "nichibun_spatial_support.json"
DEFAULT_OUTPUT_DIR = ROOT / "analysis" / "yokai_geo"

CATEGORY_LABELS = {
    "その他": "Other",
    "キツネ": "Kitsune",
    "ヘビ・リュウ": "Snake/Dragon",
    "ユウレイ": "Yurei",
    "カッパ": "Kappa",
    "タヌキ": "Tanuki",
    "テング": "Tengu",
    "オニ": "Oni",
    "ヤマノカミ": "Yama-no-kami",
    "イヌガミ": "Inugami",
    "ネコ": "Neko",
    "ヒノタマ": "Hitodama",
}

PLACE_FUNCTION_LEXICON: dict[str, list[str]] = {
    "hydrology": [
        "川",
        "河",
        "池",
        "井戸",
        "沼",
        "湖",
        "用水",
        "水路",
        "堀",
        "淵",
        "滝",
        "沢",
        "泉",
        "溝",
        "川端",
        "川辺",
        "河原",
    ],
    "mobility": [
        "道",
        "山道",
        "峠",
        "橋",
        "坂",
        "辻",
        "渡し",
        "渡",
        "街道",
        "路",
        "舟",
        "船",
        "港",
        "浜",
    ],
    "boundary": [
        "境",
        "村境",
        "山境",
        "外れ",
        "はずれ",
        "入口",
        "戸口",
        "門",
        "関",
        "墓地",
        "墓",
        "社",
        "神社",
        "寺",
        "境内",
        "岬",
    ],
    "livelihood": [
        "田",
        "田んぼ",
        "畑",
        "農",
        "稲",
        "漁",
        "漁師",
        "山仕事",
        "炭焼",
        "炭焼き",
        "狩",
        "狩り",
        "養蚕",
        "桑",
        "牛",
        "馬",
    ],
    "dwelling": [
        "家",
        "屋敷",
        "厠",
        "便所",
        "台所",
        "寝所",
        "屋根",
        "屋根裏",
        "蔵",
        "納戸",
        "座敷",
        "戸",
        "門口",
    ],
    "death_ritual": [
        "墓",
        "墓地",
        "葬式",
        "葬",
        "盆",
        "供養",
        "死体",
        "死人",
        "死者",
        "霊",
        "仏",
        "火葬",
        "埋葬",
    ],
    "taboo_time_weather": [
        "見るな",
        "見てはいけない",
        "行くな",
        "行ってはいけない",
        "食べるな",
        "食べてはいけない",
        "呼ぶな",
        "呼んではいけない",
        "入るな",
        "入ってはいけない",
        "夜",
        "夕方",
        "雨",
        "禁",
        "祟",
        "たたり",
    ],
    "actors": [
        "子供",
        "子ども",
        "小児",
        "旅人",
        "村人",
        "農民",
        "漁師",
        "僧",
        "坊主",
        "女",
        "男",
        "家族",
        "娘",
        "老人",
    ],
    "actions": [
        "呼ぶ",
        "化かす",
        "連れ去",
        "さらう",
        "音がする",
        "泣く",
        "笑う",
        "助ける",
        "祟る",
        "取る",
        "引く",
        "隠す",
        "現れる",
        "出る",
        "消える",
    ],
}

FUNCTION_COLORS = {
    "hydrology": "#0072B2",
    "mobility": "#E69F00",
    "boundary": "#CC79A7",
    "livelihood": "#009E73",
    "dwelling": "#8B5A2B",
    "death_ritual": "#666666",
    "taboo_time_weather": "#D55E00",
    "actors": "#56B4E9",
    "actions": "#999999",
}

PLACE_DESCRIPTION_CATEGORIES = {
    "hydrology",
    "mobility",
    "boundary",
    "livelihood",
    "dwelling",
    "death_ritual",
    "taboo_time_weather",
}
HUMAN_CONDITION_CATEGORIES = {"actors", "actions", "taboo_time_weather"}
GENERIC_INTERFACE_TYPES = {"human_environment_interface"}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build folklore spatial-support model outputs.")
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--top-n", type=int, default=12)
    return parser.parse_args()


def load_records(path: Path) -> list[dict[str, Any]]:
    with path.open("r", encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, list):
        raise ValueError(f"Expected list JSON at {path}")
    return [row for row in data if isinstance(row, dict)]


def atomic_write_json(path: Path, payload: Any, *, indent: int | None = None) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f"{path.name}.tmp")
    with tmp.open("w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=indent)
    os.replace(tmp, path)


def write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if not rows:
        path.write_text("", encoding="utf-8")
        return
    with path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)


def num(value: Any) -> float | None:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    return parsed if math.isfinite(parsed) else None


def category_label(category: str) -> str:
    return CATEGORY_LABELS.get(category, category)


def unique_terms(terms: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for term in terms:
        if term and term not in seen:
            seen.add(term)
            out.append(term)
    return out


def extract_place_functions(text: str) -> dict[str, list[str]]:
    support: dict[str, list[str]] = {}
    for category, terms in PLACE_FUNCTION_LEXICON.items():
        hits = unique_terms([term for term in terms if term in text])
        if hits:
            support[category] = hits
    return support


def interface_types(place_categories: set[str], terrain_categories: set[str]) -> list[str]:
    types: list[str] = []
    if "hydrology" in place_categories and "mobility" in place_categories:
        types.append("water_crossing")
    if "hydrology" in place_categories and "boundary" in place_categories:
        types.append("waterside_boundary")
    if "hydrology" in place_categories and "taboo_time_weather" in place_categories:
        types.append("water_danger_norm")
    if "mountain" in terrain_categories and "mobility" in place_categories:
        types.append("mountain_route")
    if "mountain" in terrain_categories and "boundary" in place_categories:
        types.append("mountain_boundary")
    if "coast" in terrain_categories and "mobility" in place_categories:
        types.append("coastal_landing")
    if "dwelling" in place_categories and "boundary" in place_categories:
        types.append("domestic_threshold")
    if "death_ritual" in place_categories and "boundary" in place_categories:
        types.append("mortuary_boundary")
    if "livelihood" in place_categories and "hydrology" in place_categories:
        types.append("water_livelihood")

    environmental = {"hydrology", "livelihood"} & place_categories or {"water", "mountain", "coast"} & terrain_categories
    human = {"mobility", "boundary", "dwelling", "death_ritual", "taboo_time_weather", "actors", "actions"} & place_categories
    if environmental and human:
        types.append("human_environment_interface")
    return unique_terms(types)


def confidence_reason(record: dict[str, Any], place_functions: dict[str, list[str]]) -> str:
    method = str(record.get("_geocode_method") or "")
    if str(record.get("_geo_level") or "") == "municipality" and method:
        return f"unique_{method}"
    if record.get("_place_mentions"):
        return "prefecture_metadata_with_unresolved_toponym"
    if place_functions:
        return "prefecture_metadata_with_textual_place_function"
    return "prefecture_metadata_only"


def administrative_support(record: dict[str, Any]) -> dict[str, Any]:
    pref_area = num(record.get("_pref_area_km2"))
    admin2_area = num(record.get("_admin2_area_km2"))
    is_admin2 = str(record.get("_geo_level") or "") == "municipality" and admin2_area is not None
    area = admin2_area if is_admin2 else pref_area
    label = record.get("_geocoded_place") if is_admin2 else record.get("prefecture")
    reduction = None
    if pref_area and area:
        reduction = max(0.0, min(1.0, 1.0 - area / pref_area))
    return {
        "level": "admin2" if is_admin2 else "prefecture",
        "label": label,
        "geometry_type": "polygon",
        "area_km2": None if area is None else round(float(area), 3),
        "inherited_prefecture": record.get("prefecture"),
        "inherited_prefecture_area_km2": None if pref_area is None else round(float(pref_area), 3),
        "area_reduction_ratio": None if reduction is None else round(reduction, 5),
    }


def build_support(record: dict[str, Any]) -> dict[str, Any]:
    summary = str(record.get("summary") or "")
    place_functions = extract_place_functions(summary)
    place_categories = set(place_functions)
    place_description_categories = sorted(place_categories & PLACE_DESCRIPTION_CATEGORIES)
    human_condition_categories = sorted(place_categories & HUMAN_CONDITION_CATEGORIES)
    terrain_categories = {str(value) for value in record.get("_terrain_term_categories", []) or []}
    interfaces = interface_types(place_categories, terrain_categories)
    strict_interfaces = [interface for interface in interfaces if interface not in GENERIC_INTERFACE_TYPES]
    admin_support = administrative_support(record)
    return {
        "administrative_support": admin_support,
        "toponym_support": {
            "mentions": record.get("_place_mentions", []) or [],
            "mention_count": len(record.get("_place_mentions", []) or []),
            "resolved_name": record.get("_geocoded_place"),
            "resolution_method": record.get("_geocode_method"),
            "candidate_status": (
                "unique_admin2"
                if admin_support["level"] == "admin2"
                else ("mentioned_unresolved" if record.get("_place_mentions") else "none")
            ),
        },
        "terrain_support": {
            "coordinate_only": record.get("_terrain_coord_only"),
            "text_aware": record.get("_terrain_text_aware"),
            "terms": record.get("_terrain_terms", []) or [],
            "term_categories": sorted(terrain_categories),
        },
        "place_function_support": [
            {"category": category, "terms": terms}
            for category, terms in sorted(place_functions.items())
        ],
        "place_description_support": [
            {"category": category, "terms": place_functions[category]}
            for category in place_description_categories
        ],
        "human_condition_support": [
            {"category": category, "terms": place_functions[category]}
            for category in human_condition_categories
        ],
        "interface_support": {
            "has_any_interface": bool(interfaces),
            "has_boundary_interface": bool(strict_interfaces),
            "interface_types": interfaces,
            "strict_interface_types": strict_interfaces,
            "interface_score": len(interfaces),
            "strict_interface_score": len(strict_interfaces),
        },
        "textual_support": {
            "place_function_terms": place_functions,
            "place_mention_spans": record.get("_place_mention_spans", []) or [],
        },
        "source_support": {
            "region": record.get("region"),
            "phenomenon": record.get("phenomenon"),
            "major_category": record.get("major_category"),
        },
        "resolution_level": record.get("_geo_level"),
        "confidence_reason": confidence_reason(record, place_functions),
    }


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


def support_stage_rows(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []

    def add_row(stage: str, subset: list[dict[str, Any]], area_field: str | None = None) -> None:
        areas = [value for value in (num(row.get(area_field)) for row in subset) if value is not None] if area_field else []
        reductions = [
            value
            for value in (num(row.get("_support_area_reduction_ratio")) for row in subset)
            if value is not None
        ]
        rows.append(
            {
                "stage": stage,
                "records": len(subset),
                "coverage": round(len(subset) / (len(records) or 1), 5),
                **{f"support_area_km2_{key}": value for key, value in summarize(areas).items()},
                **{f"area_reduction_ratio_{key}": value for key, value in summarize(reductions).items()},
            }
        )

    add_row("prefecture_metadata", records, "_pref_area_km2")
    add_row(
        "local_admin2_gazetteer",
        [row for row in records if str(row.get("_geo_level") or "") == "municipality"],
        "_admin2_area_km2",
    )
    add_row("formal_toponym_mentions", [row for row in records if row.get("_place_mentions")])
    add_row("terrain_terms", [row for row in records if row.get("_terrain_terms")])
    add_row("place_description_terms", [row for row in records if row.get("_place_description_categories")])
    add_row("human_condition_terms", [row for row in records if row.get("_human_condition_categories")])
    add_row("strict_boundary_interface_terms", [row for row in records if row.get("_has_boundary_interface")])
    add_row("any_human_environment_interface", [row for row in records if row.get("_has_any_interface")])
    add_row(
        "admin2_or_boundary_interface",
        [
            row
            for row in records
            if str(row.get("_geo_level") or "") == "municipality" or row.get("_has_boundary_interface")
        ],
    )
    return rows


def category_place_function_rows(records: list[dict[str, Any]], categories: list[str]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    function_categories = list(PLACE_FUNCTION_LEXICON)
    for category in categories:
        subset = [row for row in records if str(row.get("major_category") or "unknown") == category]
        total = len(subset) or 1
        out: dict[str, Any] = {
            "major_category": category,
            "label": category_label(category),
            "n": len(subset),
        }
        for function_category in function_categories:
            count = sum(1 for row in subset if function_category in set(row.get("_place_function_categories", [])))
            out[f"n_{function_category}"] = count
            out[f"pct_{function_category}"] = round(count / total, 5)
        boundary_count = sum(1 for row in subset if row.get("_has_boundary_interface"))
        out["n_boundary_interface"] = boundary_count
        out["pct_boundary_interface"] = round(boundary_count / total, 5)
        rows.append(out)
    return rows


def interface_type_rows(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    counts: Counter[str] = Counter()
    category_counts: dict[str, Counter[str]] = defaultdict(Counter)
    for row in records:
        category = str(row.get("major_category") or "unknown")
        for interface in row.get("_strict_boundary_interface_types", []) or []:
            counts[interface] += 1
            category_counts[interface][category] += 1
    rows: list[dict[str, Any]] = []
    for interface, count in counts.most_common():
        rows.append(
            {
                "interface_type": interface,
                "records": count,
                "share": round(count / (len(records) or 1), 5),
                "top_categories": "; ".join(
                    f"{category_label(category)}={value}"
                    for category, value in category_counts[interface].most_common(5)
                ),
            }
        )
    return rows


def prefecture_centroid_context(records: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in records:
        if str(row.get("_geo_level") or "") == "prefecture":
            grouped[str(row.get("prefecture") or "unknown")].append(row)
    context: dict[str, dict[str, Any]] = {}
    for pref, subset in grouped.items():
        terrain_counts = Counter(str(row.get("_terrain_coord_only") or "unknown") for row in subset)
        water = [value for value in (num(row.get("_dist_water_km")) for row in subset) if value is not None]
        coast = [value for value in (num(row.get("_dist_coast_km")) for row in subset) if value is not None]
        context[pref] = {
            "prefecture_coordinate_terrain": terrain_counts.most_common(1)[0][0] if terrain_counts else "unknown",
            "prefecture_coordinate_dist_water_km": None if not water else round(float(np.median(water)), 3),
            "prefecture_coordinate_dist_coast_km": None if not coast else round(float(np.median(coast)), 3),
        }
    return context


def distortion_type(pref_class: str, admin2_class: str, pref_water: float | None, admin2_water: float | None) -> str:
    if pref_class != admin2_class:
        return f"{pref_class}_to_{admin2_class}"
    if pref_water is not None and admin2_water is not None:
        if pref_water < 2 <= admin2_water:
            return "water_proximity_lost"
        if pref_water >= 2 > admin2_water:
            return "water_proximity_gained"
    return "same_class"


def admin2_refinement_distortion_rows(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    pref_context = prefecture_centroid_context(records)
    rows: list[dict[str, Any]] = []
    for row in records:
        if str(row.get("_geo_level") or "") != "municipality":
            continue
        pref = str(row.get("prefecture") or "unknown")
        context = pref_context.get(pref)
        if not context:
            continue
        pref_class = str(context.get("prefecture_coordinate_terrain") or "unknown")
        admin2_class = str(row.get("_terrain_coord_only") or "unknown")
        pref_water = num(context.get("prefecture_coordinate_dist_water_km"))
        admin2_water = num(row.get("_dist_water_km"))
        pref_coast = num(context.get("prefecture_coordinate_dist_coast_km"))
        admin2_coast = num(row.get("_dist_coast_km"))
        rows.append(
            {
                "id": row.get("id"),
                "major_category": row.get("major_category"),
                "label": category_label(str(row.get("major_category") or "unknown")),
                "prefecture": pref,
                "admin2": row.get("_geocoded_place") or row.get("_admin2"),
                "prefecture_coordinate_terrain": pref_class,
                "admin2_coordinate_terrain": admin2_class,
                "terrain_changed": pref_class != admin2_class,
                "distortion_type": distortion_type(pref_class, admin2_class, pref_water, admin2_water),
                "prefecture_coordinate_dist_water_km": pref_water,
                "admin2_dist_water_km": admin2_water,
                "delta_water_km": None if pref_water is None or admin2_water is None else round(admin2_water - pref_water, 3),
                "prefecture_coordinate_dist_coast_km": pref_coast,
                "admin2_dist_coast_km": admin2_coast,
                "delta_coast_km": None if pref_coast is None or admin2_coast is None else round(admin2_coast - pref_coast, 3),
                "support_area_reduction_ratio": row.get("_support_area_reduction_ratio"),
                "place_description_categories": ";".join(row.get("_place_description_categories", []) or []),
                "strict_interface_types": ";".join(row.get("_strict_boundary_interface_types", []) or []),
            }
        )
    return rows


def top_categories(records: list[dict[str, Any]], top_n: int) -> list[str]:
    counts = Counter(str(row.get("major_category") or "unknown") for row in records)
    return [category for category, _count in counts.most_common(top_n)]


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


def plot_place_function_counts(path: Path, counts: Counter[str]) -> None:
    labels = [category for category in PLACE_FUNCTION_LEXICON if counts.get(category, 0) > 0]
    values = [counts[category] for category in labels]
    y = np.arange(len(labels))
    plt.figure(figsize=(7.2, 4.6))
    plt.barh(y, values, color=[FUNCTION_COLORS.get(label, "#999999") for label in labels])
    plt.yticks(y, labels)
    plt.xlabel("Records with term")
    plt.title("Place-function evidence extracted from summaries")
    for idx, value in enumerate(values):
        plt.text(value, idx, f" {value:,}", va="center", fontsize=9)
    plt.xlim(0, max(values) * 1.18 if values else 1)
    plt.gca().invert_yaxis()
    plt.tight_layout()
    plt.savefig(path, dpi=220)
    plt.close()


def plot_boundary_interface_by_category(path: Path, rows: list[dict[str, Any]]) -> None:
    ordered = sorted(rows, key=lambda row: float(row.get("pct_boundary_interface") or 0), reverse=True)
    labels = [str(row["label"]) for row in ordered]
    values = [float(row.get("pct_boundary_interface") or 0) for row in ordered]
    counts = [int(row.get("n_boundary_interface") or 0) for row in ordered]
    y = np.arange(len(ordered))
    plt.figure(figsize=(8.4, max(5.2, 0.42 * len(ordered) + 1.2)))
    plt.barh(y, values, color="#CC79A7")
    plt.yticks(y, labels)
    plt.xlabel("Share of category records")
    plt.xlim(0, max(values) * 1.18 if values else 1)
    plt.title("Boundary-interface evidence by yokai category")
    for idx, value in enumerate(values):
        plt.text(value, idx, f" {value:.1%} ({counts[idx]:,})", va="center", fontsize=8)
    plt.gca().invert_yaxis()
    plt.tight_layout()
    plt.savefig(path, dpi=220)
    plt.close()


def plot_support_stage_coverage(path: Path, rows: list[dict[str, Any]]) -> None:
    labels = [str(row["stage"]).replace("_", " ") for row in rows]
    values = [int(row["records"]) for row in rows]
    y = np.arange(len(rows))
    plt.figure(figsize=(8.0, 4.8))
    plt.barh(y, values, color="#0072B2")
    plt.yticks(y, labels)
    plt.xlabel("Records")
    plt.title("Coverage of spatial-support evidence stages")
    for idx, value in enumerate(values):
        plt.text(value, idx, f" {value:,}", va="center", fontsize=8)
    plt.xlim(0, max(values) * 1.18 if values else 1)
    plt.gca().invert_yaxis()
    plt.tight_layout()
    plt.savefig(path, dpi=220)
    plt.close()


def plot_support_area_reduction(path: Path, records: list[dict[str, Any]]) -> None:
    refined = [row for row in records if str(row.get("_geo_level") or "") == "municipality"]
    if not refined:
        return
    reductions = [float(row["_support_area_reduction_ratio"]) for row in refined if row.get("_support_area_reduction_ratio") is not None]
    areas = [float(row["_support_area_km2"]) for row in refined if row.get("_support_area_km2") is not None]
    fig, axes = plt.subplots(1, 2, figsize=(9.2, 4.2))
    axes[0].hist(reductions, bins=24, color="#009E73", edgecolor="white")
    axes[0].set_xlabel("Area reduction ratio")
    axes[0].set_ylabel("Records")
    axes[0].set_title("Prefecture to admin2 reduction")
    axes[1].hist(areas, bins=24, color="#E69F00", edgecolor="white")
    axes[1].set_xlabel("Admin2 support area (km2)")
    axes[1].set_ylabel("Records")
    axes[1].set_title("Admin2 support area")
    plt.tight_layout()
    plt.savefig(path, dpi=220)
    plt.close()


def plot_admin2_refinement_distortion(path: Path, rows: list[dict[str, Any]]) -> None:
    if not rows:
        return
    counts = Counter(str(row["distortion_type"]) for row in rows)
    labels = [label for label, _count in counts.most_common()]
    values = [counts[label] for label in labels]
    y = np.arange(len(labels))
    plt.figure(figsize=(8.2, max(4.8, 0.36 * len(labels) + 1.2)))
    colors = ["#D55E00" if label != "same_class" else "#999999" for label in labels]
    plt.barh(y, values, color=colors)
    plt.yticks(y, labels)
    plt.xlabel("Locally refined records")
    plt.title("How admin2 refinement changes coordinate-derived interpretation")
    for idx, value in enumerate(values):
        plt.text(value, idx, f" {value:,}", va="center", fontsize=8)
    plt.xlim(0, max(values) * 1.18 if values else 1)
    plt.gca().invert_yaxis()
    plt.tight_layout()
    plt.savefig(path, dpi=220)
    plt.close()


def run(records: list[dict[str, Any]], output: Path, output_dir: Path, top_n: int) -> dict[str, Any]:
    configure_plots()
    enriched: list[dict[str, Any]] = []
    function_counts: Counter[str] = Counter()
    function_term_counts: Counter[str] = Counter()
    function_terms_by_category: dict[str, Counter[str]] = defaultdict(Counter)
    interface_counts: Counter[str] = Counter()
    strict_interface_counts: Counter[str] = Counter()
    confidence_counts: Counter[str] = Counter()
    support_area_values: list[float] = []
    reduction_values: list[float] = []

    for record in records:
        support = build_support(record)
        flat = dict(record)
        function_categories = [item["category"] for item in support["place_function_support"]]
        function_terms = unique_terms(
            term
            for item in support["place_function_support"]
            for term in item["terms"]
        )
        support_area = support["administrative_support"]["area_km2"]
        reduction = support["administrative_support"]["area_reduction_ratio"]
        flat["_spatial_support"] = support
        flat["_place_function_categories"] = function_categories
        flat["_place_function_terms"] = function_terms
        flat["_place_description_categories"] = [item["category"] for item in support["place_description_support"]]
        flat["_human_condition_categories"] = [item["category"] for item in support["human_condition_support"]]
        flat["_has_any_interface"] = support["interface_support"]["has_any_interface"]
        flat["_has_boundary_interface"] = support["interface_support"]["has_boundary_interface"]
        flat["_boundary_interface_types"] = support["interface_support"]["interface_types"]
        flat["_strict_boundary_interface_types"] = support["interface_support"]["strict_interface_types"]
        flat["_support_area_km2"] = support_area
        flat["_support_area_reduction_ratio"] = reduction
        flat["_support_confidence_reason"] = support["confidence_reason"]
        enriched.append(flat)

        function_counts.update(function_categories)
        function_term_counts.update(function_terms)
        for item in support["place_function_support"]:
            function_terms_by_category[item["category"]].update(item["terms"])
        interface_counts.update(support["interface_support"]["interface_types"])
        strict_interface_counts.update(support["interface_support"]["strict_interface_types"])
        confidence_counts[support["confidence_reason"]] += 1
        if support_area is not None:
            support_area_values.append(float(support_area))
        if reduction is not None:
            reduction_values.append(float(reduction))

    output_dir.mkdir(parents=True, exist_ok=True)
    atomic_write_json(output, enriched)

    categories = top_categories(enriched, top_n)
    stage_rows = support_stage_rows(enriched)
    category_rows = category_place_function_rows(enriched, categories)
    interface_rows = interface_type_rows(enriched)
    distortion_rows = admin2_refinement_distortion_rows(enriched)
    function_rows = [
        {
            "place_function": category,
            "records": function_counts.get(category, 0),
            "share": round(function_counts.get(category, 0) / (len(enriched) or 1), 5),
            "top_terms": "; ".join(
                f"{term}={count}"
                for term, count in function_terms_by_category[category].most_common(12)
            ),
        }
        for category in PLACE_FUNCTION_LEXICON
    ]
    reduction_by_level = {
        level: summarize(
            [
                float(row["_support_area_reduction_ratio"])
                for row in enriched
                if str(row.get("_geo_level") or "unknown") == level
                and row.get("_support_area_reduction_ratio") is not None
            ]
        )
        for level in sorted({str(row.get("_geo_level") or "unknown") for row in enriched})
    }
    summary = {
        "input_records": len(enriched),
        "support_model": "Folklore Spatial Support Model",
        "geo_level_counts": dict(Counter(str(row.get("_geo_level") or "unknown") for row in enriched).most_common()),
        "place_function_counts": dict(function_counts.most_common()),
        "place_function_term_counts_top30": dict(function_term_counts.most_common(30)),
        "boundary_interface_records": int(sum(1 for row in enriched if row.get("_has_boundary_interface"))),
        "boundary_interface_share": round(
            sum(1 for row in enriched if row.get("_has_boundary_interface")) / (len(enriched) or 1),
            5,
        ),
        "any_interface_records": int(sum(1 for row in enriched if row.get("_has_any_interface"))),
        "any_interface_share": round(
            sum(1 for row in enriched if row.get("_has_any_interface")) / (len(enriched) or 1),
            5,
        ),
        "boundary_interface_type_counts": dict(interface_counts.most_common()),
        "strict_boundary_interface_type_counts": dict(strict_interface_counts.most_common()),
        "admin2_refinement_distortion": {
            "records": len(distortion_rows),
            "terrain_changed_records": sum(1 for row in distortion_rows if row["terrain_changed"]),
            "terrain_changed_share": round(
                sum(1 for row in distortion_rows if row["terrain_changed"]) / (len(distortion_rows) or 1),
                5,
            ),
            "distortion_type_counts": dict(Counter(str(row["distortion_type"]) for row in distortion_rows).most_common()),
            "delta_water_km": summarize(
                [float(row["delta_water_km"]) for row in distortion_rows if row.get("delta_water_km") is not None]
            ),
            "delta_coast_km": summarize(
                [float(row["delta_coast_km"]) for row in distortion_rows if row.get("delta_coast_km") is not None]
            ),
        },
        "confidence_reason_counts": dict(confidence_counts.most_common()),
        "support_area_km2": summarize(support_area_values),
        "area_reduction_ratio": summarize(reduction_values),
        "area_reduction_ratio_by_geo_level": reduction_by_level,
        "stages": stage_rows,
        "interpretation": (
            "The model represents the spatial support of each folklore record, not a single asserted event point. "
            "Administrative polygons provide support area; toponyms, terrain terms, place-function terms, and source "
            "metadata provide evidence channels; boundary-interface flags identify records where environmental and "
            "human-use terms co-occur."
        ),
    }

    write_csv(output_dir / "spatial_support_stage_summary.csv", stage_rows)
    write_csv(output_dir / "place_function_category_counts.csv", function_rows)
    write_csv(output_dir / "category_place_function_table.csv", category_rows)
    write_csv(output_dir / "boundary_interface_type_counts.csv", interface_rows)
    write_csv(output_dir / "admin2_refinement_distortion.csv", distortion_rows)
    atomic_write_json(output_dir / "spatial_support_summary.json", summary, indent=2)

    plot_place_function_counts(output_dir / "fig_place_function_counts.png", function_counts)
    plot_boundary_interface_by_category(output_dir / "fig_boundary_interface_by_category.png", category_rows)
    plot_support_stage_coverage(output_dir / "fig_spatial_support_stage_coverage.png", stage_rows)
    plot_support_area_reduction(output_dir / "fig_support_area_reduction.png", enriched)
    plot_admin2_refinement_distortion(output_dir / "fig_admin2_refinement_distortion.png", distortion_rows)
    return summary


def main() -> None:
    args = parse_args()
    summary = run(load_records(args.input), args.output, args.output_dir, args.top_n)
    print("=== Folklore spatial support model ===")
    print(f"Records: {summary['input_records']:,}")
    print(f"Geo levels: {summary['geo_level_counts']}")
    print(f"Place-function counts: {summary['place_function_counts']}")
    print(
        "Strict boundary-interface records: "
        f"{summary['boundary_interface_records']:,} "
        f"({summary['boundary_interface_share']:.1%})"
    )
    print(
        "Any human-environment interface records: "
        f"{summary['any_interface_records']:,} "
        f"({summary['any_interface_share']:.1%})"
    )
    print(
        "Admin2 terrain interpretation changed: "
        f"{summary['admin2_refinement_distortion']['terrain_changed_records']:,} "
        f"({summary['admin2_refinement_distortion']['terrain_changed_share']:.1%})"
    )
    print(f"Support area median: {summary['support_area_km2']['median']} km2")
    print(f"Saved support records: {args.output}")
    print(f"Saved summaries: {args.output_dir}")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Robustness diagnostics for the folklore spatial-support model."""

from __future__ import annotations

import argparse
import csv
import json
import os
import re
from collections import Counter
from pathlib import Path
from typing import Any

import matplotlib.pyplot as plt
import numpy as np

from build_spatial_support_model import PLACE_FUNCTION_LEXICON, interface_types
from spatial_support_null_model import (
    PLACE_FUNCTIONS,
    category_label,
    feature_matrix,
    stratified_permutation_counts,
    top_categories,
)


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_INPUT = ROOT / "data" / "nichibun" / "nichibun_enriched.json"
DEFAULT_OUTPUT_DIR = ROOT / "analysis" / "yokai_geo"

CATEGORY_SURFACE_FORMS = [
    "河童",
    "かっぱ",
    "カッパ",
    "天狗",
    "狐",
    "きつね",
    "キツネ",
    "幽霊",
    "亡霊",
    "ゆうれい",
    "ユウレイ",
    "蛇",
    "龍",
    "竜",
    "へび",
    "ヘビ",
    "狸",
    "たぬき",
    "タヌキ",
    "鬼",
    "おに",
    "オニ",
    "山の神",
    "山神",
    "犬神",
    "猫",
    "ねこ",
    "ネコ",
    "火の玉",
    "人魂",
]

KEY_ASSOCIATIONS = [
    ("カッパ", "hydrology", "Kappa-Hydrology"),
    ("ユウレイ", "death_ritual", "Yurei-Death"),
    ("ヘビ・リュウ", "strict_boundary_interface", "Snake/Dragon-Boundary"),
]

CONSERVATIVE_EXCLUDED_INTERFACES = {"water_danger_norm"}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run spatial-support robustness ablations.")
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--top-n", type=int, default=12)
    parser.add_argument("--permutations", type=int, default=500)
    parser.add_argument("--seed", type=int, default=20260615)
    parser.add_argument("--dictionary-drop-replicates", type=int, default=5)
    return parser.parse_args()


def load_records(path: Path) -> list[dict[str, Any]]:
    with path.open("r", encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, list):
        raise ValueError(f"Expected list JSON at {path}")
    return [row for row in data if isinstance(row, dict)]


def write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if not rows:
        path.write_text("", encoding="utf-8")
        return
    with path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)


def unique(values: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for value in values:
        if value and value not in seen:
            seen.add(value)
            out.append(value)
    return out


def mask_category_names(text: str) -> str:
    masked, _counts = mask_category_names_with_counts(text)
    return masked


def mask_category_names_with_counts(text: str) -> tuple[str, Counter[str]]:
    masked = text
    counts: Counter[str] = Counter()
    for form in sorted(CATEGORY_SURFACE_FORMS, key=len, reverse=True):
        count = masked.count(form)
        if count:
            counts[form] += count
        masked = masked.replace(form, " ")
    return masked, counts


def category_mask_audit(records: list[dict[str, Any]]) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    form_counts: Counter[str] = Counter()
    form_record_counts: Counter[str] = Counter()
    affected_records = 0
    for record in records:
        text = str(record.get("summary") or "")
        _masked, counts = mask_category_names_with_counts(text)
        if counts:
            affected_records += 1
            form_counts.update(counts)
            for form in counts:
                form_record_counts[form] += 1
    rows = [
        {
            "surface_form": form,
            "occurrences_removed": int(form_counts[form]),
            "records_affected": int(form_record_counts[form]),
        }
        for form, _count in form_counts.most_common()
    ]
    summary = {
        "records_affected": affected_records,
        "record_share": round(affected_records / max(1, len(records)), 5),
        "occurrences_removed": int(sum(form_counts.values())),
        "unique_surface_forms_matched": len(form_counts),
    }
    return summary, rows


def extract_place_functions(text: str, lexicon: dict[str, list[str]]) -> dict[str, list[str]]:
    support: dict[str, list[str]] = {}
    for category, terms in lexicon.items():
        hits = unique([term for term in terms if term in text])
        if hits:
            support[category] = hits
    return support


def build_rows(
    records: list[dict[str, Any]],
    lexicon: dict[str, list[str]],
    *,
    mask_names: bool,
    interface_mode: str,
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for record in records:
        row = dict(record)
        summary = str(row.get("summary") or "")
        if mask_names:
            summary = mask_category_names(summary)
        place_functions = extract_place_functions(summary, lexicon)
        place_categories = set(place_functions)
        terrain_categories = {str(value) for value in row.get("_terrain_term_categories", []) or []}
        strict_types = [
            value
            for value in interface_types(place_categories, terrain_categories)
            if value != "human_environment_interface"
        ]
        if interface_mode == "broad":
            environmental = (
                {"hydrology", "livelihood"} & place_categories
                or {"water", "mountain", "coast"} & terrain_categories
            )
            human = {
                "mobility",
                "boundary",
                "dwelling",
                "death_ritual",
                "taboo_time_weather",
                "actors",
                "actions",
            } & place_categories
            has_interface = bool(environmental and human)
        elif interface_mode == "conservative":
            strict_types = [value for value in strict_types if value not in CONSERVATIVE_EXCLUDED_INTERFACES]
            has_interface = bool(strict_types)
        else:
            has_interface = bool(strict_types)

        row["_place_function_categories"] = sorted(place_categories)
        row["_place_function_terms"] = unique([term for terms in place_functions.values() for term in terms])
        row["_strict_boundary_interface_types"] = strict_types
        row["_has_boundary_interface"] = has_interface
        rows.append(row)
    return rows


def drop_lexicon_terms(drop_rate: float, seed: int) -> dict[str, list[str]]:
    rng = np.random.default_rng(seed)
    out: dict[str, list[str]] = {}
    for category, terms in PLACE_FUNCTION_LEXICON.items():
        terms = list(terms)
        if not terms:
            out[category] = []
            continue
        keep_count = max(1, int(round(len(terms) * (1.0 - drop_rate))))
        indices = np.sort(rng.choice(len(terms), size=keep_count, replace=False))
        out[category] = [terms[int(index)] for index in indices]
    return out


def null_rows(
    records: list[dict[str, Any]],
    categories: list[str],
    permutations: int,
    seed: int,
) -> list[dict[str, Any]]:
    labels = np.asarray([str(row.get("major_category") or "unknown") for row in records], dtype=object)
    strata = np.asarray([str(row.get("prefecture") or "unknown") for row in records], dtype=object)
    features = feature_matrix(records)
    observed, expected, z, p_empirical, category_sizes = stratified_permutation_counts(
        labels, features, strata, categories, permutations, seed
    )
    rows: list[dict[str, Any]] = []
    for i, category in enumerate(categories):
        for j, feature in enumerate(PLACE_FUNCTIONS):
            rows.append(
                {
                    "major_category": category,
                    "label": category_label(category),
                    "category_n": int(category_sizes[i]),
                    "feature": feature,
                    "observed": int(observed[i, j]),
                    "expected": round(float(expected[i, j]), 3),
                    "lift": round(float(observed[i, j] / expected[i, j]), 5) if expected[i, j] > 0 else None,
                    "z_score": round(float(z[i, j]), 4),
                    "empirical_p": round(float(p_empirical[i, j]), 5),
                }
            )
    return rows


def pick_key_associations(
    rows: list[dict[str, Any]],
    condition: str,
    *,
    replicate: int = 0,
) -> list[dict[str, Any]]:
    by_key = {(row["major_category"], row["feature"]): row for row in rows}
    out: list[dict[str, Any]] = []
    for category, feature, label in KEY_ASSOCIATIONS:
        row = by_key[(category, feature)]
        out.append(
            {
                "condition": condition,
                "replicate": replicate,
                "association": label,
                "major_category": category,
                "feature": feature,
                "observed": row["observed"],
                "expected": row["expected"],
                "lift": row["lift"],
                "z_score": row["z_score"],
                "empirical_p": row["empirical_p"],
            }
        )
    return out


def median_row(rows: list[dict[str, Any]], condition: str, association: str) -> dict[str, Any]:
    values = {key: np.asarray([float(row[key]) for row in rows], dtype=float) for key in ["observed", "expected", "lift", "z_score", "empirical_p"]}
    first = rows[0]
    return {
        "condition": condition,
        "replicate": "median",
        "replicates": len(rows),
        "association": association,
        "major_category": first["major_category"],
        "feature": first["feature"],
        "observed": round(float(np.median(values["observed"])), 3),
        "expected": round(float(np.median(values["expected"])), 3),
        "lift": round(float(np.median(values["lift"])), 5),
        "z_score": round(float(np.median(values["z_score"])), 4),
        "z_iqr_low": round(float(np.quantile(values["z_score"], 0.25)), 4),
        "z_iqr_high": round(float(np.quantile(values["z_score"], 0.75)), 4),
        "empirical_p": round(float(np.median(values["empirical_p"])), 5),
    }


def aggregate_key_associations(rows: list[dict[str, Any]], condition: str) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for _category, _feature, association in KEY_ASSOCIATIONS:
        selected = [row for row in rows if row["condition"] == condition and row["association"] == association]
        if selected:
            out.append(median_row(selected, condition, association))
    return out


def single_replicate_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for row in rows:
        out.append(
            {
                **row,
                "replicates": 1,
                "z_iqr_low": row["z_score"],
                "z_iqr_high": row["z_score"],
            }
        )
    return out


def plot_key_associations(path: Path, rows: list[dict[str, Any]]) -> None:
    selected_conditions = [
        "full_dictionary",
        "category_name_masked",
        "drop_10pct",
        "drop_20pct",
        "drop_30pct",
        "interface_broad",
        "interface_strict",
        "interface_conservative",
    ]
    selected = [row for row in rows if row["condition"] in selected_conditions]
    associations = [label for _category, _feature, label in KEY_ASSOCIATIONS]
    x = np.arange(len(selected_conditions))
    width = 0.24
    plt.figure(figsize=(9.4, 4.8))
    for idx, association in enumerate(associations):
        values = []
        for condition in selected_conditions:
            match = next(row for row in selected if row["condition"] == condition and row["association"] == association)
            values.append(float(match["z_score"]))
        plt.bar(x + (idx - 1) * width, values, width=width, label=association)
    plt.axhline(0, color="#333333", linewidth=0.8)
    plt.xticks(x, [value.replace("_", "\n") for value in selected_conditions], fontsize=8)
    plt.ylabel("z-score")
    plt.title("Robustness of key place-function associations")
    plt.legend(frameon=False, ncol=1)
    plt.tight_layout()
    plt.savefig(path, dpi=220)
    plt.close()


def run(
    records: list[dict[str, Any]],
    output_dir: Path,
    top_n: int,
    permutations: int,
    seed: int,
    dictionary_drop_replicates: int,
) -> dict[str, Any]:
    output_dir.mkdir(parents=True, exist_ok=True)
    categories = top_categories(records, top_n)
    condition_rows: list[dict[str, Any]] = []
    key_rows: list[dict[str, Any]] = []

    conditions: list[tuple[str, dict[str, list[str]], bool, str, int]] = [
        ("full_dictionary", PLACE_FUNCTION_LEXICON, False, "strict", seed),
        ("category_name_masked", PLACE_FUNCTION_LEXICON, True, "strict", seed),
        ("interface_broad", PLACE_FUNCTION_LEXICON, False, "broad", seed),
        ("interface_strict", PLACE_FUNCTION_LEXICON, False, "strict", seed),
        ("interface_conservative", PLACE_FUNCTION_LEXICON, False, "conservative", seed),
    ]

    for condition, lexicon, mask_names, interface_mode, condition_seed in conditions:
        support_rows = build_rows(records, lexicon, mask_names=mask_names, interface_mode=interface_mode)
        rows = null_rows(support_rows, categories, permutations, condition_seed)
        for row in rows:
            condition_rows.append({"condition": condition, "replicate": 0, **row})
        key_rows.extend(single_replicate_rows(pick_key_associations(rows, condition)))

    replicate_key_rows: list[dict[str, Any]] = []
    for pct in [0.1, 0.2, 0.3]:
        condition = f"drop_{int(pct * 100)}pct"
        for replicate in range(1, max(1, dictionary_drop_replicates) + 1):
            replicate_seed = seed + int(pct * 1000) + replicate
            lexicon = drop_lexicon_terms(pct, replicate_seed)
            support_rows = build_rows(records, lexicon, mask_names=False, interface_mode="strict")
            rows = null_rows(support_rows, categories, permutations, seed)
            for row in rows:
                condition_rows.append({"condition": condition, "replicate": replicate, **row})
            replicate_key_rows.extend(pick_key_associations(rows, condition, replicate=replicate))
        key_rows.extend(aggregate_key_associations(replicate_key_rows, condition))

    mask_summary, mask_rows = category_mask_audit(records)
    write_csv(output_dir / "spatial_support_category_mask_audit.csv", mask_rows)
    write_csv(output_dir / "spatial_support_robustness_all.csv", condition_rows)
    write_csv(output_dir / "spatial_support_robustness_key_associations.csv", key_rows)
    plot_key_associations(output_dir / "fig_spatial_support_robustness.png", key_rows)
    summary = {
        "input_records": len(records),
        "permutations": permutations,
        "seed": seed,
        "dictionary_drop_replicates": dictionary_drop_replicates,
        "category_mask_audit": mask_summary,
        "key_associations": key_rows,
        "conditions": [condition[0] for condition in conditions] + ["drop_10pct", "drop_20pct", "drop_30pct"],
        "interpretation": (
            "Category-name masking, dictionary-drop sensitivity, and interface-definition "
            "ablations test whether the strongest place-function associations survive "
            "reasonable changes to the rule-based extraction setup."
        ),
    }
    write_json(output_dir / "spatial_support_robustness_summary.json", summary)
    return summary


def main() -> None:
    args = parse_args()
    summary = run(
        load_records(args.input),
        args.output_dir,
        args.top_n,
        args.permutations,
        args.seed,
        args.dictionary_drop_replicates,
    )
    print("=== Spatial-support robustness diagnostics ===")
    print(f"Records: {summary['input_records']:,}")
    print(f"Permutations per condition: {summary['permutations']:,}")
    print(f"Dictionary-drop replicates: {summary['dictionary_drop_replicates']:,}")
    for row in summary["key_associations"]:
        if row["condition"] in {"full_dictionary", "category_name_masked", "drop_30pct", "interface_conservative"}:
            print(f"  {row['condition']} / {row['association']}: z={row['z_score']}")
    print(f"Saved outputs: {args.output_dir}")


if __name__ == "__main__":
    main()

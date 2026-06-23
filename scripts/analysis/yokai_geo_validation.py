#!/usr/bin/env python3
"""Local validation diagnostics for the yokai geography pipeline.

This script does not call public geocoding APIs. It summarizes NER coverage,
terrain-term coverage, centroid-derived terrain labels, and creates a manual
review scaffold for paper validation.
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import random
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Iterable


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_CLEANED = ROOT / "data" / "nichibun" / "nichibun_cleaned.json"
DEFAULT_ENRICHED = ROOT / "data" / "nichibun" / "nichibun_enriched.json"
DEFAULT_NER = ROOT / "data" / "nichibun" / "nichibun_ner.json"
DEFAULT_OUTPUT_DIR = ROOT / "analysis" / "yokai_geo_validation"

TERRAIN_CATEGORIES = ["water", "mountain", "coast", "boundary", "agrarian"]
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
MANUAL_REVIEW_FIELDS = [
    "sample_id",
    "record_id",
    "name",
    "major_category",
    "prefecture",
    "summary",
    "_place_mentions",
    "_terrain_terms",
    "_terrain_term_categories",
    "_terrain_class",
    "_geo_level",
    "review_place_mention_valid",
    "review_terrain_term_valid",
    "review_implied_terrain",
    "review_geography_specificity",
    "review_notes",
]


def display_label(value: Any) -> str:
    text = str(value)
    return CATEGORY_LABELS.get(text, text)


def configure_plots(plt: Any) -> None:
    plt.rcParams.update(
        {
            "font.size": 10,
            "axes.titlesize": 11,
            "axes.labelsize": 10,
            "xtick.labelsize": 9,
            "ytick.labelsize": 9,
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
    parser = argparse.ArgumentParser(description="Create local validation diagnostics for yokai geo pipeline.")
    parser.add_argument("--cleaned", type=Path, default=DEFAULT_CLEANED)
    parser.add_argument("--enriched", type=Path, default=DEFAULT_ENRICHED)
    parser.add_argument("--ner", type=Path, default=DEFAULT_NER)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--manual-sample-size", type=int, default=120)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument(
        "--restrict-to-ner",
        action="store_true",
        help="Restrict records to IDs present in the NER file. Useful for sample diagnostics.",
    )
    return parser.parse_args()


def load_json(path: Path, required: bool = True) -> Any:
    if not path.exists():
        if required:
            raise FileNotFoundError(path)
        return None
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def load_records(path: Path, required: bool = True) -> list[dict[str, Any]]:
    data = load_json(path, required=required)
    if data is None:
        return []
    if not isinstance(data, list):
        raise ValueError(f"Expected list JSON at {path}")
    return [row for row in data if isinstance(row, dict)]


def atomic_write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f"{path.name}.tmp")
    with tmp.open("w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    os.replace(tmp, path)


def write_csv(path: Path, rows: Iterable[dict[str, Any]], fieldnames: list[str] | None = None) -> None:
    rows = list(rows)
    if fieldnames is None:
        keys: list[str] = []
        seen: set[str] = set()
        for row in rows:
            for key in row:
                if key not in seen:
                    seen.add(key)
                    keys.append(key)
        fieldnames = keys
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow({key: serialize_cell(row.get(key)) for key in fieldnames})


def serialize_cell(value: Any) -> Any:
    if isinstance(value, (list, dict)):
        return json.dumps(value, ensure_ascii=False)
    return value


def as_list(value: Any) -> list[str]:
    if isinstance(value, list):
        return [str(item) for item in value if str(item).strip()]
    return []


def category(row: dict[str, Any]) -> str:
    return str(row.get("major_category") or "unknown")


def prefecture(row: dict[str, Any]) -> str:
    return str(row.get("prefecture") or "unknown")


def record_id(row: dict[str, Any]) -> str:
    return str(row.get("id") or row.get("record_id") or "")


def mean(values: list[int]) -> float:
    return round(sum(values) / len(values), 4) if values else 0.0


def median(values: list[int]) -> float:
    if not values:
        return 0.0
    values = sorted(values)
    mid = len(values) // 2
    if len(values) % 2:
        return float(values[mid])
    return round((values[mid - 1] + values[mid]) / 2, 4)


def coverage_rows(records: list[dict[str, Any]], group_key: str, kind: str) -> list[dict[str, Any]]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in records:
        key = category(row) if group_key == "category" else prefecture(row)
        grouped[key].append(row)
    out = []
    for key, rows in sorted(grouped.items(), key=lambda item: (-len(item[1]), item[0])):
        if kind == "place":
            counts = [len(as_list(row.get("_place_mentions"))) for row in rows]
        else:
            counts = [len(as_list(row.get("_terrain_terms"))) for row in rows]
        nonzero = sum(1 for count in counts if count > 0)
        out.append(
            {
                group_key: key,
                "records": len(rows),
                "records_with_hits": nonzero,
                "coverage": round(nonzero / len(rows), 4) if rows else 0.0,
                "mean_hits": mean(counts),
                "median_hits": median(counts),
            }
        )
    return out


def maybe_plot_bar(path: Path, rows: list[dict[str, Any]], label_key: str, value_key: str, title: str) -> None:
    try:
        import matplotlib.pyplot as plt
    except ModuleNotFoundError:
        return
    configure_plots(plt)
    top = sorted(rows, key=lambda row: float(row[value_key]), reverse=True)[:15]
    if not top:
        return
    labels = [display_label(row[label_key]) for row in top]
    values = [float(row[value_key]) for row in top]
    path.parent.mkdir(parents=True, exist_ok=True)
    y = range(len(top))
    plt.figure(figsize=(8.2, max(4.8, 0.34 * len(top) + 1.0)))
    plt.barh(y, values, color="#0072B2")
    plt.yticks(y, labels)
    plt.xlabel(value_key.replace("_", " "))
    plt.title(title)
    plt.gca().invert_yaxis()
    for idx, value in enumerate(values):
        label = f" {value:.1%}" if value <= 1 else f" {value:.1f}"
        plt.text(value, idx, label, va="center", fontsize=8)
    if values and max(values) <= 1:
        plt.xlim(0, 1)
    plt.tight_layout()
    plt.savefig(path, dpi=200)
    plt.close()


def maybe_plot_crosstab(path: Path, rows: list[dict[str, Any]], row_key: str, col_key: str, value_key: str) -> None:
    try:
        import matplotlib.pyplot as plt
    except ModuleNotFoundError:
        return
    configure_plots(plt)
    row_labels = sorted({str(row[row_key]) for row in rows})
    col_labels = sorted({str(row[col_key]) for row in rows})
    if not row_labels or not col_labels:
        return
    matrix = [[0 for _ in col_labels] for _ in row_labels]
    row_index = {value: index for index, value in enumerate(row_labels)}
    col_index = {value: index for index, value in enumerate(col_labels)}
    for row in rows:
        matrix[row_index[str(row[row_key])]][col_index[str(row[col_key])]] = int(row[value_key])
    plt.figure(figsize=(8, 5))
    plt.imshow(matrix, cmap="Blues")
    plt.xticks(range(len(col_labels)), col_labels, rotation=45, ha="right")
    plt.yticks(range(len(row_labels)), row_labels)
    plt.colorbar(label=value_key)
    plt.tight_layout()
    plt.savefig(path, dpi=200)
    plt.close()


def merge_enriched_ner(
    enriched: list[dict[str, Any]],
    ner: list[dict[str, Any]],
    restrict_to_ner: bool = False,
) -> list[dict[str, Any]]:
    ner_by_id = {record_id(row): row for row in ner if record_id(row)}
    out = []
    for row in enriched:
        if restrict_to_ner and record_id(row) not in ner_by_id:
            continue
        merged = dict(row)
        ner_row = ner_by_id.get(record_id(row))
        if ner_row:
            for key in ["_place_mentions", "_place_mention_spans", "_terrain_terms", "_terrain_term_categories"]:
                if key in ner_row:
                    merged[key] = ner_row[key]
        out.append(merged)
    return out


def top_counter_rows(counter: Counter[str], key_name: str, limit: int = 50) -> list[dict[str, Any]]:
    return [{key_name: key, "count": count} for key, count in counter.most_common(limit)]


def validation_summary(records: list[dict[str, Any]], has_ner: bool) -> dict[str, Any]:
    place_counts = [len(as_list(row.get("_place_mentions"))) for row in records]
    terrain_counts = [len(as_list(row.get("_terrain_terms"))) for row in records]
    terrain_class_counts = Counter(str(row.get("_terrain_class") or "unknown") for row in records)
    geo_level_counts = Counter(str(row.get("_geo_level") or "unknown") for row in records)
    category_counts = Counter(category(row) for row in records)
    return {
        "records": len(records),
        "has_ner_file": has_ner,
        "records_with_place_mentions": sum(1 for count in place_counts if count > 0),
        "place_mention_coverage": round(sum(1 for count in place_counts if count > 0) / len(records), 4)
        if records
        else 0.0,
        "mean_place_mentions": mean(place_counts),
        "median_place_mentions": median(place_counts),
        "records_with_terrain_terms": sum(1 for count in terrain_counts if count > 0),
        "terrain_term_coverage": round(sum(1 for count in terrain_counts if count > 0) / len(records), 4)
        if records
        else 0.0,
        "mean_terrain_terms": mean(terrain_counts),
        "median_terrain_terms": median(terrain_counts),
        "terrain_class_counts": dict(terrain_class_counts),
        "geo_level_counts": dict(geo_level_counts),
        "top_categories": dict(category_counts.most_common(15)),
    }


def terrain_category_crosstab(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    counts: Counter[tuple[str, str]] = Counter()
    for row in records:
        assigned = str(row.get("_terrain_class") or "unknown")
        categories = as_list(row.get("_terrain_term_categories")) or ["none"]
        for term_category in categories:
            counts[(term_category, assigned)] += 1
    return [
        {"terrain_term_category": term_category, "assigned_terrain_class": assigned, "records": count}
        for (term_category, assigned), count in sorted(counts.items())
    ]


def terrain_conflict_examples(records: list[dict[str, Any]], limit: int = 100) -> list[dict[str, Any]]:
    examples = []
    for row in records:
        cats = set(as_list(row.get("_terrain_term_categories")))
        assigned = str(row.get("_terrain_class") or "unknown")
        conflict = False
        if "mountain" in cats and assigned in {"coastal", "plain"}:
            conflict = True
        if "water" in cats and assigned == "plain":
            conflict = True
        if "coast" in cats and assigned not in {"coastal"}:
            conflict = True
        if not conflict:
            continue
        examples.append(
            {
                "id": record_id(row),
                "name": row.get("name"),
                "major_category": category(row),
                "prefecture": prefecture(row),
                "summary": row.get("summary"),
                "_terrain_terms": as_list(row.get("_terrain_terms")),
                "_terrain_term_categories": as_list(row.get("_terrain_term_categories")),
                "_terrain_class": assigned,
                "_dist_water_km": row.get("_dist_water_km"),
                "_dist_coast_km": row.get("_dist_coast_km"),
            }
        )
        if len(examples) >= limit:
            break
    return examples


def manual_review_sample(records: list[dict[str, Any]], sample_size: int, seed: int) -> list[dict[str, Any]]:
    rng = random.Random(seed)
    buckets: list[list[dict[str, Any]]] = [
        [row for row in records if as_list(row.get("_place_mentions"))],
        [row for row in records if not as_list(row.get("_place_mentions"))],
        [row for row in records if as_list(row.get("_terrain_terms"))],
        terrain_conflict_examples(records, limit=len(records)),
        [row for row in records if category(row) in {"\u30ab\u30c3\u30d1", "Kappa"}],
        [row for row in records if category(row) in {"\u30c6\u30f3\u30b0", "Tengu"}],
        [row for row in records if category(row) in {"\u30ad\u30c4\u30cd", "Kitsune"}],
    ]
    selected: dict[str, dict[str, Any]] = {}
    per_bucket = max(5, sample_size // max(1, len(buckets)))
    for bucket in buckets:
        if not bucket:
            continue
        for row in rng.sample(bucket, min(per_bucket, len(bucket))):
            selected.setdefault(record_id(row), row)
    remaining = [row for row in records if record_id(row) not in selected]
    if len(selected) < sample_size and remaining:
        for row in rng.sample(remaining, min(sample_size - len(selected), len(remaining))):
            selected.setdefault(record_id(row), row)
    out = []
    for index, row in enumerate(selected.values(), start=1):
        out.append(
            {
                "sample_id": f"YR{index:04d}",
                "record_id": record_id(row),
                "name": row.get("name"),
                "major_category": category(row),
                "prefecture": prefecture(row),
                "summary": row.get("summary"),
                "_place_mentions": as_list(row.get("_place_mentions")),
                "_terrain_terms": as_list(row.get("_terrain_terms")),
                "_terrain_term_categories": as_list(row.get("_terrain_term_categories")),
                "_terrain_class": row.get("_terrain_class"),
                "_geo_level": row.get("_geo_level"),
                "review_place_mention_valid": "",
                "review_terrain_term_valid": "",
                "review_implied_terrain": "",
                "review_geography_specificity": "",
                "review_notes": "",
            }
        )
    return out


def write_codebook(path: Path) -> None:
    path.write_text(
        """# Yokai Geography Manual Review Codebook

Fill one row per sampled record.

- `review_place_mention_valid`: yes / partial / no / not_applicable
- `review_terrain_term_valid`: yes / partial / no / not_applicable
- `review_implied_terrain`: water / mountain / coast / boundary / agrarian / settlement / none / uncertain
- `review_geography_specificity`: prefecture / municipality / locality / landmark / generic_terrain / none / uncertain
- `review_notes`: short reason for disagreement or ambiguity

The review evaluates extraction quality and geographic specificity. It should not judge whether the folklore itself is true.
""",
        encoding="utf-8",
    )


def main() -> None:
    args = parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    enriched = load_records(args.enriched)
    ner = load_records(args.ner, required=False)
    records = merge_enriched_ner(enriched, ner, restrict_to_ner=args.restrict_to_ner) if ner else enriched

    summary = validation_summary(records, has_ner=bool(ner))
    atomic_write_json(args.output_dir / "validation_summary.json", summary)

    place_by_category = coverage_rows(records, "category", "place")
    place_by_prefecture = coverage_rows(records, "prefecture", "place")
    terrain_by_category = coverage_rows(records, "category", "terrain")
    terrain_by_prefecture = coverage_rows(records, "prefecture", "terrain")

    write_csv(args.output_dir / "ner_coverage_by_category.csv", place_by_category)
    write_csv(args.output_dir / "ner_coverage_by_prefecture.csv", place_by_prefecture)
    write_csv(args.output_dir / "terrain_term_by_category.csv", terrain_by_category)
    write_csv(args.output_dir / "terrain_term_by_prefecture.csv", terrain_by_prefecture)

    place_counter: Counter[str] = Counter()
    term_counter: Counter[str] = Counter()
    term_category_counter: Counter[str] = Counter()
    for row in records:
        place_counter.update(as_list(row.get("_place_mentions")))
        term_counter.update(as_list(row.get("_terrain_terms")))
        term_category_counter.update(as_list(row.get("_terrain_term_categories")))

    write_csv(args.output_dir / "top_place_mentions.csv", top_counter_rows(place_counter, "place"))
    write_csv(args.output_dir / "terrain_keyword_hits.csv", top_counter_rows(term_counter, "terrain_term"))
    write_csv(args.output_dir / "terrain_category_hits.csv", top_counter_rows(term_category_counter, "terrain_category"))

    cross = terrain_category_crosstab(records)
    write_csv(args.output_dir / "terrain_term_vs_assigned_class.csv", cross)
    write_csv(args.output_dir / "terrain_term_conflict_examples.csv", terrain_conflict_examples(records))

    zero_place = [row for row in records if not as_list(row.get("_place_mentions"))][:200]
    write_csv(
        args.output_dir / "zero_place_mentions_sample.csv",
        [
            {
                "id": record_id(row),
                "name": row.get("name"),
                "major_category": category(row),
                "prefecture": prefecture(row),
                "summary": row.get("summary"),
            }
            for row in zero_place
        ],
    )

    sample = manual_review_sample(records, args.manual_sample_size, args.seed)
    write_csv(args.output_dir / "manual_review_sample.csv", sample, MANUAL_REVIEW_FIELDS)
    write_codebook(args.output_dir / "manual_review_codebook.md")
    atomic_write_json(
        args.output_dir / "manual_review_sampling_manifest.json",
        {"seed": args.seed, "requested_sample_size": args.manual_sample_size, "actual_sample_size": len(sample)},
    )

    maybe_plot_bar(
        args.output_dir / "fig_ner_coverage_by_category.png",
        place_by_category,
        "category",
        "coverage",
        "Place Mention Coverage by Category",
    )
    maybe_plot_bar(
        args.output_dir / "fig_terrain_term_coverage_by_category.png",
        terrain_by_category,
        "category",
        "coverage",
        "Terrain Term Coverage by Category",
    )
    maybe_plot_crosstab(
        args.output_dir / "fig_terrain_terms_vs_centroid_class.png",
        cross,
        "terrain_term_category",
        "assigned_terrain_class",
        "records",
    )

    print("=== Yokai geo validation ===")
    print(f"Records: {summary['records']:,}")
    print(f"NER file present: {summary['has_ner_file']}")
    print(
        "Place mention coverage: "
        f"{summary['records_with_place_mentions']:,}/{summary['records']:,} "
        f"({summary['place_mention_coverage']:.1%})"
    )
    print(
        "Terrain term coverage: "
        f"{summary['records_with_terrain_terms']:,}/{summary['records']:,} "
        f"({summary['terrain_term_coverage']:.1%})"
    )
    print(f"Saved outputs: {args.output_dir}")


if __name__ == "__main__":
    main()

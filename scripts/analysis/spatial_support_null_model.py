#!/usr/bin/env python3
"""Permutation null models for folklore spatial-support features."""

from __future__ import annotations

import argparse
import csv
import json
import math
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

import matplotlib.pyplot as plt
import numpy as np


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_INPUT = ROOT / "data" / "nichibun" / "nichibun_spatial_support.json"
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

PLACE_FUNCTIONS = [
    "hydrology",
    "mobility",
    "boundary",
    "livelihood",
    "dwelling",
    "death_ritual",
    "taboo_time_weather",
    "actors",
    "actions",
    "strict_boundary_interface",
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run stratified permutation null model.")
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--top-n", type=int, default=12)
    parser.add_argument("--permutations", type=int, default=500)
    parser.add_argument("--seed", type=int, default=20260615)
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


def category_label(category: str) -> str:
    return CATEGORY_LABELS.get(category, category)


def top_categories(records: list[dict[str, Any]], top_n: int) -> list[str]:
    counts = Counter(str(row.get("major_category") or "unknown") for row in records)
    return [category for category, _count in counts.most_common(top_n)]


def feature_matrix(records: list[dict[str, Any]]) -> np.ndarray:
    matrix = np.zeros((len(records), len(PLACE_FUNCTIONS)), dtype=np.int16)
    for idx, row in enumerate(records):
        categories = set(str(value) for value in row.get("_place_function_categories", []) or [])
        for col, feature in enumerate(PLACE_FUNCTIONS):
            if feature == "strict_boundary_interface":
                matrix[idx, col] = 1 if row.get("_has_boundary_interface") else 0
            elif feature in categories:
                matrix[idx, col] = 1
    return matrix


def observed_counts(labels: np.ndarray, features: np.ndarray, categories: list[str]) -> np.ndarray:
    out = np.zeros((len(categories), features.shape[1]), dtype=float)
    for idx, category in enumerate(categories):
        mask = labels == category
        if np.any(mask):
            out[idx, :] = features[mask].sum(axis=0)
    return out


def stratified_permutation_counts(
    labels: np.ndarray,
    features: np.ndarray,
    strata: np.ndarray,
    categories: list[str],
    permutations: int,
    seed: int,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    rng = np.random.default_rng(seed)
    category_index = {category: i for i, category in enumerate(categories)}
    category_sizes = np.array([(labels == category).sum() for category in categories], dtype=float)
    observed = observed_counts(labels, features, categories)
    permuted = np.zeros((permutations, len(categories), features.shape[1]), dtype=float)
    strata_indices = [np.where(strata == value)[0] for value in np.unique(strata)]

    for perm in range(permutations):
        shuffled = labels.copy()
        for indices in strata_indices:
            shuffled[indices] = rng.permutation(shuffled[indices])
        permuted[perm] = observed_counts(shuffled, features, categories)

    expected = permuted.mean(axis=0)
    std = permuted.std(axis=0, ddof=1)
    z = np.divide(observed - expected, std, out=np.zeros_like(observed), where=std > 0)
    p_empirical = np.ones_like(observed)
    for i in range(observed.shape[0]):
        for j in range(observed.shape[1]):
            if observed[i, j] >= expected[i, j]:
                p_empirical[i, j] = (1 + np.sum(permuted[:, i, j] >= observed[i, j])) / (permutations + 1)
            else:
                p_empirical[i, j] = (1 + np.sum(permuted[:, i, j] <= observed[i, j])) / (permutations + 1)
    return observed, expected, z, p_empirical, category_sizes


def plot_null_heatmap(path: Path, rows: list[dict[str, Any]], categories: list[str]) -> None:
    by_key = {(row["major_category"], row["feature"]): row for row in rows}
    values = np.zeros((len(categories), len(PLACE_FUNCTIONS)))
    for i, category in enumerate(categories):
        for j, feature in enumerate(PLACE_FUNCTIONS):
            values[i, j] = float(by_key[(category, feature)]["z_score"])
    vmax = min(max(4.0, float(np.max(np.abs(values)))), 14.0)
    plt.figure(figsize=(9.4, max(4.8, 0.38 * len(categories) + 1.2)))
    image = plt.imshow(values, cmap="RdBu_r", vmin=-vmax, vmax=vmax, aspect="auto")
    plt.colorbar(image, label="z-score against within-prefecture category shuffle")
    plt.xticks(np.arange(len(PLACE_FUNCTIONS)), PLACE_FUNCTIONS, rotation=35, ha="right")
    plt.yticks(np.arange(len(categories)), [category_label(category) for category in categories])
    plt.title("Place-function associations beyond prefecture composition")
    for i in range(values.shape[0]):
        for j in range(values.shape[1]):
            if abs(values[i, j]) >= 2:
                color = "white" if abs(values[i, j]) > vmax * 0.55 else "black"
                plt.text(j, i, f"{values[i, j]:.1f}", ha="center", va="center", fontsize=7, color=color)
    plt.tight_layout()
    plt.savefig(path, dpi=220)
    plt.close()


def run(records: list[dict[str, Any]], output_dir: Path, top_n: int, permutations: int, seed: int) -> dict[str, Any]:
    output_dir.mkdir(parents=True, exist_ok=True)
    categories = top_categories(records, top_n)
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
                    "observed_share": round(float(observed[i, j] / max(1, category_sizes[i])), 5),
                    "expected": round(float(expected[i, j]), 3),
                    "expected_share": round(float(expected[i, j] / max(1, category_sizes[i])), 5),
                    "lift": round(float(observed[i, j] / expected[i, j]), 5) if expected[i, j] > 0 else None,
                    "z_score": round(float(z[i, j]), 4),
                    "empirical_p": round(float(p_empirical[i, j]), 5),
                }
            )
    write_csv(output_dir / "category_place_function_null_model.csv", rows)
    plot_null_heatmap(output_dir / "fig_place_function_null_residuals.png", rows, categories)
    strongest = sorted(rows, key=lambda row: abs(float(row["z_score"])), reverse=True)[:20]
    summary = {
        "input_records": len(records),
        "top_categories": categories,
        "features": PLACE_FUNCTIONS,
        "null_model": "category labels shuffled within prefecture strata",
        "permutations": permutations,
        "seed": seed,
        "strongest_abs_z": strongest,
    }
    write_json(output_dir / "category_place_function_null_model_summary.json", summary)
    return summary


def main() -> None:
    args = parse_args()
    summary = run(load_records(args.input), args.output_dir, args.top_n, args.permutations, args.seed)
    print("=== Spatial-support null model ===")
    print(f"Records: {summary['input_records']:,}")
    print(f"Permutations: {summary['permutations']:,}")
    print("Strongest associations:")
    for row in summary["strongest_abs_z"][:8]:
        print(
            f"  {row['label']} / {row['feature']}: "
            f"obs={row['observed']}, exp={row['expected']}, z={row['z_score']}"
        )
    print(f"Saved outputs: {args.output_dir}")


if __name__ == "__main__":
    main()

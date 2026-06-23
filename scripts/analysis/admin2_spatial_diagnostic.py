#!/usr/bin/env python3
"""Admin2-only water-feature diagnostics for locally refined yokai records."""

from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path
from typing import Any

import matplotlib.pyplot as plt
import numpy as np


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_INPUT = ROOT / "data" / "nichibun" / "nichibun_spatial_support.json"
DEFAULT_OUTPUT_DIR = ROOT / "analysis" / "yokai_geo"

TARGET_CATEGORIES = ["カッパ", "ヘビ・リュウ", "ユウレイ", "キツネ", "テング"]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run admin2-only water-feature distance diagnostics.")
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--permutations", type=int, default=10000)
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


def admin2_rows(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    rows = []
    for row in records:
        if row.get("_geo_level") != "municipality":
            continue
        try:
            dist = float(row.get("_dist_water_km"))
            area = float(row.get("_admin2_area_km2"))
        except (TypeError, ValueError):
            continue
        if not np.isfinite(dist) or not np.isfinite(area):
            continue
        rows.append(row)
    return rows


def metric_values(distances: np.ndarray) -> dict[str, float]:
    if len(distances) == 0:
        return {
            "median_dist_water_km": np.nan,
            "mean_dist_water_km": np.nan,
            "share_within_2km": np.nan,
            "share_within_0_5km": np.nan,
        }
    return {
        "median_dist_water_km": float(np.median(distances)),
        "mean_dist_water_km": float(np.mean(distances)),
        "share_within_2km": float(np.mean(distances <= 2.0)),
        "share_within_0_5km": float(np.mean(distances <= 0.5)),
    }


def observed_for(labels: np.ndarray, distances: np.ndarray, category: str) -> dict[str, float]:
    return metric_values(distances[labels == category])


def permute_within_strata(labels: np.ndarray, strata: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    shuffled = labels.copy()
    for value in np.unique(strata):
        idx = np.where(strata == value)[0]
        shuffled[idx] = rng.permutation(shuffled[idx])
    return shuffled


def summarize_metric(observed: float, null_values: np.ndarray, direction: str) -> dict[str, float | None]:
    null_values = null_values[np.isfinite(null_values)]
    if len(null_values) == 0 or not np.isfinite(observed):
        return {"expected": None, "z_score": None, "empirical_p": None}
    expected = float(np.mean(null_values))
    std = float(np.std(null_values, ddof=1))
    if direction == "low":
        z = (expected - observed) / std if std else 0.0
        p = (1 + int(np.sum(null_values <= observed))) / (len(null_values) + 1)
    else:
        z = (observed - expected) / std if std else 0.0
        p = (1 + int(np.sum(null_values >= observed))) / (len(null_values) + 1)
    return {
        "expected": round(expected, 5),
        "z_score": round(float(z), 5),
        "empirical_p": round(float(p), 5),
    }


def run(records: list[dict[str, Any]], output_dir: Path, permutations: int, seed: int) -> dict[str, Any]:
    rows = admin2_rows(records)
    labels = np.asarray([str(row.get("major_category") or "") for row in rows], dtype=object)
    prefectures = np.asarray([str(row.get("prefecture") or "") for row in rows], dtype=object)
    distances = np.asarray([float(row["_dist_water_km"]) for row in rows], dtype=float)

    rng = np.random.default_rng(seed)
    null_metrics: dict[str, dict[str, list[float]]] = {
        category: {
            "median_dist_water_km": [],
            "mean_dist_water_km": [],
            "share_within_2km": [],
            "share_within_0_5km": [],
        }
        for category in TARGET_CATEGORIES
    }
    for _ in range(permutations):
        shuffled = permute_within_strata(labels, prefectures, rng)
        for category in TARGET_CATEGORIES:
            values = metric_values(distances[shuffled == category])
            for metric, value in values.items():
                null_metrics[category][metric].append(value)

    out_rows: list[dict[str, Any]] = []
    for category in TARGET_CATEGORIES:
        category_n = int(np.sum(labels == category))
        observed = observed_for(labels, distances, category)
        for metric, value in observed.items():
            direction = "low" if metric in {"median_dist_water_km", "mean_dist_water_km"} else "high"
            stats = summarize_metric(value, np.asarray(null_metrics[category][metric], dtype=float), direction)
            out_rows.append(
                {
                    "category": category,
                    "category_n": category_n,
                    "metric": metric,
                    "observed": round(float(value), 5) if np.isfinite(value) else None,
                    **stats,
                }
            )

    output_dir.mkdir(parents=True, exist_ok=True)
    write_csv(output_dir / "admin2_water_distance_diagnostic.csv", out_rows)
    plot_path = output_dir / "fig_admin2_kappa_water_diagnostic.png"
    plot_kappa_diagnostic(plot_path, out_rows, np.asarray(null_metrics["カッパ"]["median_dist_water_km"], dtype=float))
    admin2_keys = {
        (str(row.get("prefecture") or ""), str(row.get("_admin2_context_name") or row.get("_admin2") or ""))
        for row in rows
    }
    kappa_admin2_keys = {
        (str(row.get("prefecture") or ""), str(row.get("_admin2_context_name") or row.get("_admin2") or ""))
        for row in rows
        if str(row.get("major_category") or "") == "カッパ"
    }
    kappa_prefectures = {
        str(row.get("prefecture") or "")
        for row in rows
        if str(row.get("major_category") or "") == "カッパ"
    }
    summary = {
        "input_records": len(records),
        "admin2_records_with_water_distance": len(rows),
        "unique_admin2_units": len(admin2_keys),
        "kappa_admin2_records": int(np.sum(labels == "カッパ")),
        "kappa_unique_admin2_units": len(kappa_admin2_keys),
        "kappa_prefecture_count": len(kappa_prefectures),
        "permutations": permutations,
        "seed": seed,
        "null_model": "category labels shuffled within prefecture among admin2-refined records",
        "results": out_rows,
        "interpretation": (
            "This is a diagnostic on municipality representative points and nearest water features "
            "(W05 rivers plus Natural Earth lakes), not a test of exact narrative locations."
        ),
    }
    write_json(output_dir / "admin2_water_distance_diagnostic_summary.json", summary)
    return summary


def plot_kappa_diagnostic(path: Path, rows: list[dict[str, Any]], null_medians: np.ndarray) -> None:
    kappa = next(
        row for row in rows if row["category"] == "カッパ" and row["metric"] == "median_dist_water_km"
    )
    plt.figure(figsize=(6.4, 4.0))
    plt.hist(null_medians[np.isfinite(null_medians)], bins=35, color="#b7c7d8", edgecolor="white")
    plt.axvline(float(kappa["observed"]), color="#145da0", linewidth=2.2, label="observed Kappa")
    plt.axvline(float(kappa["expected"]), color="#555555", linewidth=1.8, linestyle="--", label="null mean")
    plt.xlabel("Median distance to nearest water feature (km)")
    plt.ylabel("Permutation count")
    plt.title("Admin2 subset: Kappa water-distance diagnostic")
    plt.legend(frameon=False)
    plt.tight_layout()
    plt.savefig(path, dpi=220)
    plt.close()


def main() -> None:
    args = parse_args()
    summary = run(load_records(args.input), args.output_dir, args.permutations, args.seed)
    print("=== Admin2 water-distance diagnostic ===")
    print(f"Admin2 records with water distance: {summary['admin2_records_with_water_distance']:,}")
    for row in summary["results"]:
        if row["category"] == "カッパ":
            print(
                f"  {row['metric']}: observed={row['observed']}, "
                f"expected={row['expected']}, z={row['z_score']}, p={row['empirical_p']}"
            )
    print(f"Saved outputs: {args.output_dir}")


if __name__ == "__main__":
    main()

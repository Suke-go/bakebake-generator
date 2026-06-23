#!/usr/bin/env python3
"""Analyze human-coded interpretation sheets for prefecture contrasts."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Dict, List

import numpy as np
import pandas as pd
from scipy.stats import chi2_contingency

CODE_COLUMNS = [
    "code_epistemic_mode",
    "code_social_function",
    "code_sanction_structure",
    "code_actor_structure",
    "code_outcome_type",
    "code_place_binding",
]


def cramers_v(table: np.ndarray) -> float:
    if table.size == 0:
        return float("nan")
    chi2, _, _, _ = chi2_contingency(table, correction=False)
    n = table.sum()
    if n == 0:
        return float("nan")
    r, k = table.shape
    denom = n * max(min(r - 1, k - 1), 1)
    return float(np.sqrt(chi2 / denom))


def analyze_one_column(df: pd.DataFrame, col: str, group_col: str = "prefecture") -> Dict:
    d = df[[group_col, col]].copy()
    d[col] = d[col].fillna("").astype(str).str.strip()
    d = d[~d[col].str.lower().isin({"", "nan", "none"})]
    if d.empty:
        return {"column": col, "n_labeled": 0, "status": "no_labels"}

    tab = pd.crosstab(d[group_col], d[col])
    if tab.shape[0] < 2 or tab.shape[1] < 2:
        return {
            "column": col,
            "n_labeled": int(len(d)),
            "status": "insufficient_variation",
            "table": tab.to_dict(),
        }

    chi2, p, dof, expected = chi2_contingency(tab.values, correction=False)
    return {
        "column": col,
        "n_labeled": int(len(d)),
        "status": "ok",
        "chi2": float(chi2),
        "pvalue": float(p),
        "dof": int(dof),
        "cramers_v": cramers_v(tab.values),
        "categories": tab.columns.tolist(),
        "groups": tab.index.tolist(),
        "table": tab.astype(int).to_dict(),
        "row_normalized": tab.div(tab.sum(axis=1), axis=0).fillna(0.0).to_dict(),
    }


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Analyze coded interpretation sheet.")
    p.add_argument("--sheet", type=Path, required=True, help="Path to coding_sheet.csv (filled)")
    p.add_argument("--out-dir", type=Path, default=None, help="Output dir; defaults to sheet directory")
    return p


def main() -> None:
    args = build_parser().parse_args()
    sheet = pd.read_csv(args.sheet, encoding="utf-8-sig")
    out_dir = args.out_dir if args.out_dir else args.sheet.parent
    out_dir.mkdir(parents=True, exist_ok=True)

    missing = [c for c in ["prefecture"] + CODE_COLUMNS if c not in sheet.columns]
    if missing:
        raise RuntimeError(f"Missing required columns: {missing}")

    results: List[Dict] = []
    for c in CODE_COLUMNS:
        results.append(analyze_one_column(sheet, c))

    summary_rows = []
    for r in results:
        summary_rows.append(
            {
                "column": r["column"],
                "status": r["status"],
                "n_labeled": r.get("n_labeled", 0),
                "pvalue": r.get("pvalue", np.nan),
                "cramers_v": r.get("cramers_v", np.nan),
            }
        )
    summary = pd.DataFrame(summary_rows).sort_values(["status", "pvalue"], na_position="last")
    summary.to_csv(out_dir / "coded_analysis_summary.csv", index=False, encoding="utf-8-sig")

    with (out_dir / "coded_analysis_detail.json").open("w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)

    print(summary.to_string(index=False))
    print(f"saved: {out_dir / 'coded_analysis_summary.csv'}")
    print(f"saved: {out_dir / 'coded_analysis_detail.json'}")


if __name__ == "__main__":
    main()

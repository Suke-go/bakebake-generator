#!/usr/bin/env python3
"""Archive-language analyses for the canonical ISPRS manuscript run.

This module keeps the existing inspectable dictionaries but fixes two
analytical problems in the earlier exploratory scripts:

1. the broad human--environment interface is an actual subset of
   human-condition evidence; and
2. the Snake/Dragon exploratory feature is a boundary-specific derived
   interface rather than any derived interface.

No precision, recall, F1, or calibrated confidence is computed because no
human gold labels are available.
"""

from __future__ import annotations

import math
import random
import re
from collections import Counter
from typing import Any

import numpy as np
from scipy.stats import spearmanr

import isprs_archive_language as base


DICTIONARY_VERSION = "isprs-evidence-channels-1.1.0"
DICTIONARY_DATE = "2026-07-30"
PERMUTATIONS = 10_000
ROBUSTNESS_REPLICATES = 100

CATEGORY_LABELS = base.CATEGORY_LABELS
FEATURES = base.FEATURES
FEATURE_LABELS = base.FEATURE_LABELS
CONSTRUCT_CELLS = base.CONSTRUCT_CELLS
EXPLICIT_EXPLORATORY_CELLS = base.EXPLICIT_EXPLORATORY_CELLS

BOUNDARY_INTERFACE_TYPES = {
    "waterside_boundary",
    "mountain_boundary",
    "domestic_threshold",
    "mortuary_boundary",
}


def build_language_records(
    records: list[dict[str, Any]],
    *,
    lexicon: dict[str, list[str]] | None = None,
    mask_names: bool = False,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    output, audit = base.build_language_records(
        records, lexicon=lexicon, mask_names=mask_names
    )
    for row in output:
        row["has_strict_boundary_interface"] = bool(
            BOUNDARY_INTERFACE_TYPES & set(row["strict_interface_types"])
        )
    return output, audit


def evidence_channel_counts(records: list[dict[str, Any]]) -> dict[str, int]:
    counts = base.evidence_channel_counts(records)
    counts["strict_boundary_interface_evidence"] = sum(
        bool(row["has_strict_boundary_interface"]) for row in records
    )
    if counts["broad_human_environment_interface"] > counts[
        "human_condition_evidence"
    ]:
        raise AssertionError(
            "Broad interface must be a subset of human-condition evidence"
        )
    return counts


def feature_matrix(records: list[dict[str, Any]]) -> np.ndarray:
    matrix = np.zeros((len(records), len(FEATURES)), dtype=np.int8)
    for row_index, row in enumerate(records):
        categories = set(row["place_function_categories"])
        for column, feature in enumerate(FEATURES):
            if feature == "strict_boundary_interface":
                matrix[row_index, column] = int(
                    row["has_strict_boundary_interface"]
                )
            else:
                matrix[row_index, column] = int(feature in categories)
    return matrix


def association_table(
    records: list[dict[str, Any]],
    permutations: int,
    seed: int,
    *,
    strata_field: str = "prefecture",
    stratification_label: str = "prefecture",
) -> list[dict[str, Any]]:
    labels = np.asarray([row["major_category"] for row in records], dtype=object)
    strata = np.asarray(
        [row.get(strata_field) or "unknown" for row in records], dtype=object
    )
    matrix = feature_matrix(records)
    categories = [
        category for category, _count in Counter(labels.tolist()).most_common()
    ]
    rows: list[dict[str, Any]] = []
    p_values: list[float] = []
    for category_index, category in enumerate(categories):
        target = labels == category
        for feature_index, feature_name in enumerate(FEATURES):
            observed, target_n, null, expected = base.cell_null_distribution(
                target,
                matrix[:, feature_index],
                strata,
                permutations,
                seed + category_index * 1000 + feature_index,
            )
            observed_prevalence = observed / max(1, target_n)
            null_prevalence = null / max(1, target_n)
            null_median = float(np.median(null_prevalence))
            lower, upper = base.wilson_interval(observed, target_n)
            positive_p = (1 + int(np.sum(null >= observed))) / (
                permutations + 1
            )
            negative_p = (1 + int(np.sum(null <= observed))) / (
                permutations + 1
            )
            centre = float(np.median(null))
            distance = abs(observed - centre)
            two_sided_p = (
                1 + int(np.sum(np.abs(null - centre) >= distance))
            ) / (permutations + 1)
            a = observed
            b = target_n - observed
            non_target = ~target
            c = int(matrix[non_target, feature_index].sum())
            d = int(non_target.sum()) - c
            odds_ratio, odds_lower, odds_upper = base.odds_ratio_interval(
                a, b, c, d
            )
            role = CONSTRUCT_CELLS.get(
                (category, feature_name),
                EXPLICIT_EXPLORATORY_CELLS.get(
                    (category, feature_name), "screened cell"
                ),
            )
            row = {
                "major_category": category,
                "category_label": CATEGORY_LABELS.get(category, category),
                "category_n": target_n,
                "feature": feature_name,
                "feature_label": FEATURE_LABELS[feature_name],
                "analysis_role": role,
                "observed_count": observed,
                "observed_prevalence": round(observed_prevalence, 5),
                "observed_prevalence_ci_low": round(lower, 5),
                "observed_prevalence_ci_high": round(upper, 5),
                "null_mean_count": round(expected, 3),
                "null_median_prevalence": round(null_median, 5),
                "null_prevalence_ci_low": round(
                    float(np.quantile(null_prevalence, 0.025)), 5
                ),
                "null_prevalence_ci_high": round(
                    float(np.quantile(null_prevalence, 0.975)), 5
                ),
                "observed_to_null_ratio": (
                    round(observed / expected, 5) if expected > 0 else None
                ),
                "prevalence_difference": round(
                    observed_prevalence - expected / max(1, target_n), 5
                ),
                "odds_ratio": round(odds_ratio, 5),
                "odds_ratio_ci_low": round(odds_lower, 5),
                "odds_ratio_ci_high": round(odds_upper, 5),
                "empirical_p_positive": round(positive_p, 6),
                "empirical_p_negative": round(negative_p, 6),
                "empirical_p_two_sided": round(two_sided_p, 6),
                "valid_permutations": permutations,
                "stratification": stratification_label,
            }
            rows.append(row)
            p_values.append(two_sided_p)
    q_values = base.bh_adjust(p_values)
    for row, q_value in zip(rows, q_values):
        row["benjamini_hochberg_q"] = round(q_value, 6)
    return rows


def select_focal_associations(
    rows: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    return base.select_focal_associations(rows)


def qualitative_examples(
    records: list[dict[str, Any]],
    focal: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    selected_keys = {
        (row["major_category"], row["feature"])
        for row in focal
        if row["analysis_role"] != "construct check"
    }
    for category, feature in sorted(selected_keys):
        candidates = []
        for record in records:
            if record["major_category"] != category:
                continue
            present = (
                record["has_strict_boundary_interface"]
                if feature == "strict_boundary_interface"
                else feature in set(record["place_function_categories"])
            )
            if present:
                candidates.append(record)
        candidates.sort(
            key=lambda row: (
                -len(row["strict_interface_types"]),
                -len(row["place_function_terms"]),
                row["record_id"],
            )
        )
        for record in candidates[:1]:
            excerpt = re.sub(r"\s+", " ", record["summary"]).strip()
            if len(excerpt) > 90:
                excerpt = excerpt[:89] + "…"
            rows.append(
                {
                    "major_category": category,
                    "category_label": CATEGORY_LABELS.get(category, category),
                    "feature": feature,
                    "feature_label": FEATURE_LABELS[feature],
                    "record_id": record["record_id"],
                    "summary_excerpt": excerpt,
                    "extracted_terms": "; ".join(
                        record["place_function_terms"]
                    ),
                    "interface_derivation": "; ".join(
                        sorted(
                            BOUNDARY_INTERFACE_TYPES
                            & set(record["strict_interface_types"])
                        )
                    )
                    or "not applicable",
                }
            )
    return rows


class EffectRatioContext:
    """Fast observed/stratified-expected ratios for fixed labels and strata."""

    def __init__(self, labels: np.ndarray, strata: np.ndarray) -> None:
        self.category_names, self.category_codes = np.unique(
            labels, return_inverse=True
        )
        self.stratum_names, self.stratum_codes = np.unique(
            strata, return_inverse=True
        )
        category_count = len(self.category_names)
        stratum_count = len(self.stratum_names)
        joint_codes = self.category_codes * stratum_count + self.stratum_codes
        self.category_by_stratum = np.bincount(
            joint_codes, minlength=category_count * stratum_count
        ).reshape(category_count, stratum_count)
        self.stratum_counts = np.bincount(
            self.stratum_codes, minlength=stratum_count
        ).astype(float)

    def ratios(self, feature: np.ndarray) -> dict[str, float]:
        values = np.asarray(feature, dtype=float)
        observed = np.bincount(
            self.category_codes,
            weights=values,
            minlength=len(self.category_names),
        )
        positives_by_stratum = np.bincount(
            self.stratum_codes,
            weights=values,
            minlength=len(self.stratum_names),
        )
        prevalence_by_stratum = np.divide(
            positives_by_stratum,
            self.stratum_counts,
            out=np.zeros_like(positives_by_stratum, dtype=float),
            where=self.stratum_counts > 0,
        )
        expected = self.category_by_stratum @ prevalence_by_stratum
        ratios = np.divide(
            observed,
            expected,
            out=np.full_like(observed, np.nan, dtype=float),
            where=expected > 0,
        )
        return {
            str(category): float(ratios[index])
            for index, category in enumerate(self.category_names)
        }


def strict_boundary_interface_vector(
    groups: dict[str, np.ndarray],
    terrain: dict[str, np.ndarray],
    *,
    conservative: bool = False,
) -> np.ndarray:
    components = [
        groups["hydrology"] & groups["boundary"],
        terrain["mountain"] & groups["boundary"],
    ]
    if not conservative:
        components.extend(
            [
                groups["dwelling"] & groups["boundary"],
                groups["death_ritual"] & groups["boundary"],
            ]
        )
    return np.any(np.vstack(components), axis=0)


def robustness_diagnostics(
    records: list[dict[str, Any]],
    seed: int,
    replicates: int,
) -> dict[str, Any]:
    labels = np.asarray(
        [row["major_category"] for row in records], dtype=object
    )
    strata = np.asarray([row["prefecture"] for row in records], dtype=object)
    context = EffectRatioContext(labels, strata)
    terrain = {
        category: np.asarray(
            [
                category in set(row["terrain_mention_categories"])
                for row in records
            ],
            dtype=bool,
        )
        for category in ("water", "mountain", "coast")
    }
    term_matrices = base.term_presence_matrices(records)
    full_groups = {
        group: base.combine_group(term_matrices[group], list(terms))
        for group, terms in base.PLACE_FUNCTION_LEXICON.items()
    }
    full_strict = strict_boundary_interface_vector(full_groups, terrain)
    full_feature_vectors = {
        **full_groups,
        "strict_boundary_interface": full_strict,
    }
    cells = [
        *CONSTRUCT_CELLS.keys(),
        *EXPLICIT_EXPLORATORY_CELLS.keys(),
    ]
    full_ratio_tables = {
        feature: context.ratios(vector)
        for feature, vector in full_feature_vectors.items()
    }
    full_ratios = {
        cell: full_ratio_tables[cell[1]].get(cell[0], math.nan)
        for cell in cells
    }

    masked_records, mask_audit = build_language_records(
        [
            {
                "id": row["record_id"],
                "major_category": row["major_category"],
                "prefecture": row["prefecture"],
                "summary": row["summary"],
                "_place_mentions": row["candidate_toponym_mentions"],
                "_terrain_term_categories": row[
                    "terrain_mention_categories"
                ],
            }
            for row in records
        ],
        mask_names=True,
    )
    masked_matrix = feature_matrix(masked_records)
    masked_ratio_tables = {
        feature: context.ratios(masked_matrix[:, index])
        for index, feature in enumerate(FEATURES)
    }
    masked_rows = []
    for category, feature in cells:
        ratio = masked_ratio_tables[feature].get(category, math.nan)
        full_ratio = full_ratios[(category, feature)]
        masked_rows.append(
            {
                "condition": "category-name masking",
                "major_category": category,
                "category_label": CATEGORY_LABELS.get(category, category),
                "feature": feature,
                "feature_label": FEATURE_LABELS[feature],
                "effect_ratio": round(ratio, 5),
                "full_dictionary_effect_ratio": round(full_ratio, 5),
                "relative_to_full": (
                    round(ratio / full_ratio, 5)
                    if full_ratio > 0
                    else None
                ),
            }
        )

    category_list = [
        category
        for category, _count in Counter(labels.tolist()).most_common()
    ]
    rank_cells = [
        (category, feature)
        for category in category_list
        for feature in FEATURES
    ]
    full_rank_values = np.asarray(
        [
            full_ratio_tables[feature].get(category, math.nan)
            for category, feature in rank_cells
        ],
        dtype=float,
    )
    drop_rows: list[dict[str, Any]] = []
    rank_rows: list[dict[str, Any]] = []
    for drop_rate in (0.10, 0.20, 0.30):
        for replicate in range(replicates):
            rng = random.Random(seed + int(drop_rate * 1000) + replicate)
            kept: dict[str, list[str]] = {}
            for group, terms in base.PLACE_FUNCTION_LEXICON.items():
                term_list = list(terms)
                keep_n = max(1, round(len(term_list) * (1 - drop_rate)))
                kept[group] = sorted(rng.sample(term_list, k=keep_n))
            groups = {
                group: base.combine_group(term_matrices[group], terms)
                for group, terms in kept.items()
            }
            feature_vectors = {
                **groups,
                "strict_boundary_interface": (
                    strict_boundary_interface_vector(groups, terrain)
                ),
            }
            ratio_tables = {
                feature: context.ratios(vector)
                for feature, vector in feature_vectors.items()
            }
            replicate_rank_values = np.asarray(
                [
                    ratio_tables[feature].get(category, math.nan)
                    for category, feature in rank_cells
                ],
                dtype=float,
            )
            finite_mask = np.isfinite(full_rank_values) & np.isfinite(
                replicate_rank_values
            )
            correlation = float(
                spearmanr(
                    full_rank_values[finite_mask],
                    replicate_rank_values[finite_mask],
                ).statistic
            )
            rank_rows.append(
                {
                    "drop_rate": drop_rate,
                    "replicate": replicate + 1,
                    "rank_correlation": round(correlation, 5),
                }
            )
            for category, feature in cells:
                ratio = ratio_tables[feature].get(category, math.nan)
                full_ratio = full_ratios[(category, feature)]
                drop_rows.append(
                    {
                        "drop_rate": drop_rate,
                        "replicate": replicate + 1,
                        "major_category": category,
                        "category_label": CATEGORY_LABELS.get(
                            category, category
                        ),
                        "feature": feature,
                        "feature_label": FEATURE_LABELS[feature],
                        "effect_ratio": ratio,
                        "relative_to_full": (
                            ratio / full_ratio
                            if full_ratio > 0
                            else math.nan
                        ),
                    }
                )

    drop_summary = []
    for drop_rate in (0.10, 0.20, 0.30):
        for category, feature in cells:
            selected = [
                row
                for row in drop_rows
                if row["drop_rate"] == drop_rate
                and row["major_category"] == category
                and row["feature"] == feature
            ]
            ratios = np.asarray(
                [row["effect_ratio"] for row in selected], dtype=float
            )
            relative = np.asarray(
                [row["relative_to_full"] for row in selected], dtype=float
            )
            drop_summary.append(
                {
                    "drop_rate": drop_rate,
                    "replicates": len(selected),
                    "major_category": category,
                    "category_label": CATEGORY_LABELS.get(
                        category, category
                    ),
                    "feature": feature,
                    "feature_label": FEATURE_LABELS[feature],
                    "effect_ratio_median": round(float(np.median(ratios)), 5),
                    "effect_ratio_q25": round(
                        float(np.quantile(ratios, 0.25)), 5
                    ),
                    "effect_ratio_q75": round(
                        float(np.quantile(ratios, 0.75)), 5
                    ),
                    "effect_ratio_min": round(float(np.min(ratios)), 5),
                    "effect_ratio_max": round(float(np.max(ratios)), 5),
                    "positive_association_share": round(
                        float(np.mean(ratios > 1)), 5
                    ),
                    "relative_to_full_median": round(
                        float(np.median(relative)), 5
                    ),
                }
            )

    rank_summary = []
    for drop_rate in (0.10, 0.20, 0.30):
        values = np.asarray(
            [
                row["rank_correlation"]
                for row in rank_rows
                if row["drop_rate"] == drop_rate
            ],
            dtype=float,
        )
        rank_summary.append(
            {
                "drop_rate": drop_rate,
                "replicates": len(values),
                "rank_correlation_median": round(
                    float(np.median(values)), 5
                ),
                "rank_correlation_q25": round(
                    float(np.quantile(values, 0.25)), 5
                ),
                "rank_correlation_q75": round(
                    float(np.quantile(values, 0.75)), 5
                ),
                "rank_correlation_min": round(float(np.min(values)), 5),
                "rank_correlation_max": round(float(np.max(values)), 5),
            }
        )

    snake = "ヘビ・リュウ"
    environmental = (
        full_groups["hydrology"]
        | full_groups["livelihood"]
        | terrain["water"]
        | terrain["mountain"]
        | terrain["coast"]
    )
    broad_boundary = environmental & full_groups["boundary"]
    conservative = strict_boundary_interface_vector(
        full_groups, terrain, conservative=True
    )
    interface_ablation = [
        {
            "definition": "Broad environmental × boundary",
            "snake_dragon_effect_ratio": round(
                context.ratios(broad_boundary).get(snake, math.nan), 5
            ),
        },
        {
            "definition": "Strict derived boundary interfaces",
            "snake_dragon_effect_ratio": round(
                full_ratio_tables["strict_boundary_interface"].get(
                    snake, math.nan
                ),
                5,
            ),
        },
        {
            "definition": (
                "Conservative hydrology/mountain boundary interfaces"
            ),
            "snake_dragon_effect_ratio": round(
                context.ratios(conservative).get(snake, math.nan), 5
            ),
        },
    ]

    return {
        "replicates_per_drop_rate": replicates,
        "seed": seed,
        "mask_audit": mask_audit,
        "name_masking": masked_rows,
        "dictionary_drop_replicates": drop_rows,
        "dictionary_drop_summary": drop_summary,
        "rank_correlation_replicates": rank_rows,
        "rank_correlation_summary": rank_summary,
        "interface_definition_ablation": interface_ablation,
    }


def kappa_water_distance_diagnostic(
    source_records: list[dict[str, Any]],
    permutations: int,
    seed: int,
) -> dict[str, Any]:
    return base.kappa_water_distance_diagnostic(
        source_records, permutations, seed
    )


def dictionary_manifest() -> dict[str, Any]:
    manifest = base.dictionary_manifest()
    manifest["dictionary_version"] = DICTIONARY_VERSION
    manifest["dictionary_date"] = DICTIONARY_DATE
    manifest["strict_boundary_interface_types"] = sorted(
        BOUNDARY_INTERFACE_TYPES
    )
    manifest["broad_interface_subset_assertion"] = (
        "environmental evidence AND human-condition evidence"
    )
    payload = {
        key: value for key, value in manifest.items() if key != "sha256"
    }
    manifest["sha256"] = base.stable_hash(payload)
    return manifest

#!/usr/bin/env python3
"""Canonical archive-language associations and robustness diagnostics."""

from __future__ import annotations

import hashlib
import json
import math
import random
import re
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

import numpy as np
from scipy.stats import norm, spearmanr

from build_spatial_support_model import (
    HUMAN_CONDITION_CATEGORIES,
    PLACE_DESCRIPTION_CATEGORIES,
    PLACE_FUNCTION_LEXICON,
    extract_place_functions,
    interface_types,
)
from extract_place_names import TERRAIN_KEYWORD_CATEGORIES
from spatial_support_robustness import CATEGORY_SURFACE_FORMS


DICTIONARY_VERSION = "isprs-evidence-channels-1.0.0"
DICTIONARY_DATE = "2026-07-30"
PERMUTATIONS = 10_000
ROBUSTNESS_REPLICATES = 100

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

FEATURES = (
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
)

FEATURE_LABELS = {
    "hydrology": "Water setting",
    "mobility": "Mobility",
    "boundary": "Boundary",
    "livelihood": "Livelihood",
    "dwelling": "Dwelling",
    "death_ritual": "Death ritual",
    "taboo_time_weather": "Taboo, time, or weather",
    "actors": "Actors",
    "actions": "Actions",
    "strict_boundary_interface": "Strict interface",
}

CONSTRUCT_CELLS = {
    ("カッパ", "hydrology"): "construct check",
    ("ユウレイ", "death_ritual"): "construct check",
}

EXPLICIT_EXPLORATORY_CELLS = {
    ("ヘビ・リュウ", "strict_boundary_interface"): "exploratory",
    ("カッパ", "livelihood"): "exploratory",
}

CONSERVATIVE_EXCLUDED_INTERFACES = {"water_danger_norm"}


def stable_hash(payload: Any) -> str:
    encoded = json.dumps(
        payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def unique(values: list[str]) -> list[str]:
    return list(dict.fromkeys(value for value in values if value))


def mask_category_names(text: str) -> tuple[str, int]:
    masked = text
    removed = 0
    for form in sorted(CATEGORY_SURFACE_FORMS, key=len, reverse=True):
        count = masked.count(form)
        if count:
            removed += count
            masked = masked.replace(form, " ")
    return masked, removed


def strict_interfaces(
    place_categories: set[str], terrain_categories: set[str]
) -> list[str]:
    return [
        value
        for value in interface_types(place_categories, terrain_categories)
        if value != "human_environment_interface"
    ]


def broad_interface(
    place_categories: set[str], terrain_categories: set[str]
) -> bool:
    environmental = bool(
        {"hydrology", "livelihood"} & place_categories
        or {"water", "mountain", "coast"} & terrain_categories
    )
    human_condition = bool(HUMAN_CONDITION_CATEGORIES & place_categories)
    return environmental and human_condition


def build_language_records(
    records: list[dict[str, Any]],
    *,
    lexicon: dict[str, list[str]] | None = None,
    mask_names: bool = False,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    active_lexicon = lexicon or PLACE_FUNCTION_LEXICON
    output: list[dict[str, Any]] = []
    masked_records = 0
    removed_occurrences = 0
    for record in records:
        summary = str(record.get("summary") or "")
        if mask_names:
            summary, removed = mask_category_names(summary)
            if removed:
                masked_records += 1
                removed_occurrences += removed
        extracted = extract_place_functions(summary) if lexicon is None else {
            category: unique([term for term in terms if term in summary])
            for category, terms in active_lexicon.items()
            if any(term in summary for term in terms)
        }
        place_categories = set(extracted)
        terrain_categories = {
            str(value)
            for value in (record.get("_terrain_term_categories") or [])
        }
        strict = strict_interfaces(place_categories, terrain_categories)
        human_categories = HUMAN_CONDITION_CATEGORIES & place_categories
        place_description_categories = PLACE_DESCRIPTION_CATEGORIES & place_categories
        output.append(
            {
                "record_id": str(record.get("id") or ""),
                "major_category": str(record.get("major_category") or "unknown"),
                "prefecture": str(record.get("prefecture") or "unknown"),
                "summary": str(record.get("summary") or ""),
                "candidate_toponym_mentions": record.get("_place_mentions") or [],
                "place_function_categories": sorted(place_categories),
                "place_function_terms": unique(
                    [
                        term
                        for terms in extracted.values()
                        for term in terms
                    ]
                ),
                "place_function_terms_by_category": extracted,
                "place_description_categories": sorted(
                    place_description_categories
                ),
                "human_condition_categories": sorted(human_categories),
                "terrain_mention_categories": sorted(terrain_categories),
                "strict_interface_types": strict,
                "has_candidate_toponym": bool(record.get("_place_mentions")),
                "has_place_description": bool(place_description_categories),
                "has_human_condition": bool(human_categories),
                "has_broad_interface": broad_interface(
                    place_categories, terrain_categories
                ),
                "has_strict_interface": bool(strict),
            }
        )
    audit = {
        "category_name_masking": mask_names,
        "records_affected": masked_records,
        "occurrences_removed": removed_occurrences,
    }
    return output, audit


def evidence_channel_counts(records: list[dict[str, Any]]) -> dict[str, int]:
    counts = {
        "candidate_toponym_mentions": sum(
            bool(row["has_candidate_toponym"]) for row in records
        ),
        "place_description_evidence": sum(
            bool(row["has_place_description"]) for row in records
        ),
        "human_condition_evidence": sum(
            bool(row["has_human_condition"]) for row in records
        ),
        "broad_human_environment_interface": sum(
            bool(row["has_broad_interface"]) for row in records
        ),
        "strict_interface_evidence": sum(
            bool(row["has_strict_interface"]) for row in records
        ),
    }
    if (
        counts["broad_human_environment_interface"]
        > counts["human_condition_evidence"]
    ):
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
                matrix[row_index, column] = int(row["has_strict_interface"])
            else:
                matrix[row_index, column] = int(feature in categories)
    return matrix


def wilson_interval(successes: int, total: int, alpha: float = 0.05) -> tuple[float, float]:
    if total <= 0:
        return (math.nan, math.nan)
    z = float(norm.ppf(1 - alpha / 2))
    p = successes / total
    denominator = 1 + z * z / total
    centre = (p + z * z / (2 * total)) / denominator
    spread = (
        z
        * math.sqrt(p * (1 - p) / total + z * z / (4 * total * total))
        / denominator
    )
    return centre - spread, centre + spread


def odds_ratio_interval(
    a: int, b: int, c: int, d: int
) -> tuple[float, float, float]:
    cells = [a, b, c, d]
    if any(value == 0 for value in cells):
        aa, bb, cc, dd = (value + 0.5 for value in cells)
    else:
        aa, bb, cc, dd = map(float, cells)
    odds_ratio = aa * dd / (bb * cc)
    standard_error = math.sqrt(1 / aa + 1 / bb + 1 / cc + 1 / dd)
    lower = math.exp(math.log(odds_ratio) - 1.96 * standard_error)
    upper = math.exp(math.log(odds_ratio) + 1.96 * standard_error)
    return odds_ratio, lower, upper


def bh_adjust(p_values: list[float]) -> list[float]:
    count = len(p_values)
    order = np.argsort(p_values)
    adjusted = np.ones(count, dtype=float)
    running = 1.0
    for reverse_rank in range(count - 1, -1, -1):
        index = int(order[reverse_rank])
        rank = reverse_rank + 1
        candidate = p_values[index] * count / rank
        running = min(running, candidate)
        adjusted[index] = min(1.0, running)
    return adjusted.tolist()


def cell_null_distribution(
    target_mask: np.ndarray,
    feature: np.ndarray,
    strata: np.ndarray,
    permutations: int,
    seed: int,
) -> tuple[int, int, np.ndarray, float]:
    rng = np.random.default_rng(seed)
    observed = int(feature[target_mask].sum())
    target_n = int(target_mask.sum())
    null = np.zeros(permutations, dtype=np.int32)
    expected = 0.0
    for stratum in np.unique(strata):
        indices = np.where(strata == stratum)[0]
        population = len(indices)
        target_in_stratum = int(target_mask[indices].sum())
        positives = int(feature[indices].sum())
        if target_in_stratum == 0 or positives == 0:
            continue
        expected += target_in_stratum * positives / population
        null += rng.hypergeometric(
            positives,
            population - positives,
            target_in_stratum,
            size=permutations,
        )
    return observed, target_n, null, expected


def association_table(
    records: list[dict[str, Any]],
    permutations: int,
    seed: int,
) -> list[dict[str, Any]]:
    labels = np.asarray([row["major_category"] for row in records], dtype=object)
    strata = np.asarray([row["prefecture"] for row in records], dtype=object)
    matrix = feature_matrix(records)
    categories = [
        category
        for category, _count in Counter(labels.tolist()).most_common()
    ]
    rows: list[dict[str, Any]] = []
    p_values: list[float] = []
    for category_index, category in enumerate(categories):
        target = labels == category
        for feature_index, feature_name in enumerate(FEATURES):
            observed, target_n, null, expected = cell_null_distribution(
                target,
                matrix[:, feature_index],
                strata,
                permutations,
                seed + category_index * 1000 + feature_index,
            )
            observed_prevalence = observed / max(1, target_n)
            null_prevalence = null / max(1, target_n)
            null_median = float(np.median(null_prevalence))
            lower, upper = wilson_interval(observed, target_n)
            positive_p = (1 + int(np.sum(null >= observed))) / (permutations + 1)
            negative_p = (1 + int(np.sum(null <= observed))) / (permutations + 1)
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
            odds_ratio, odds_lower, odds_upper = odds_ratio_interval(a, b, c, d)
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
                "stratification": "prefecture",
            }
            rows.append(row)
            p_values.append(two_sided_p)
    q_values = bh_adjust(p_values)
    for row, q_value in zip(rows, q_values):
        row["benjamini_hochberg_q"] = round(q_value, 6)
    return rows


def select_focal_associations(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_key = {
        (row["major_category"], row["feature"]): row
        for row in rows
    }
    focal = [
        dict(by_key[key])
        for key in [*CONSTRUCT_CELLS, *EXPLICIT_EXPLORATORY_CELLS]
    ]
    for feature in ("mobility", "dwelling", "taboo_time_weather"):
        candidates = [
            row
            for row in rows
            if row["feature"] == feature
            and row["major_category"] != "その他"
            and row["observed_count"] >= 20
            and row["observed_to_null_ratio"] is not None
        ]
        if candidates:
            selected = max(
                candidates,
                key=lambda row: (
                    -float(row["benjamini_hochberg_q"]),
                    float(row["observed_to_null_ratio"]),
                ),
            )
            selected = dict(selected)
            selected["analysis_role"] = "post-hoc exploratory screen"
            focal.append(selected)
    return focal


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
                record["has_strict_interface"]
                if feature == "strict_boundary_interface"
                else feature in set(record["place_function_categories"])
            )
            if not present:
                continue
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
                    "extracted_terms": "; ".join(record["place_function_terms"]),
                    "interface_derivation": "; ".join(
                        record["strict_interface_types"]
                    )
                    or "not applicable",
                }
            )
    return rows


def kappa_water_distance_diagnostic(
    source_records: list[dict[str, Any]],
    permutations: int,
    seed: int,
) -> dict[str, Any]:
    rows = [
        record
        for record in source_records
        if record.get("_geo_level") == "municipality"
        and isinstance(record.get("_dist_water_km"), (int, float))
        and math.isfinite(float(record["_dist_water_km"]))
    ]
    labels = np.asarray(
        [str(row.get("major_category") or "") for row in rows], dtype=object
    )
    strata = np.asarray(
        [str(row.get("prefecture") or "") for row in rows], dtype=object
    )
    distances = np.asarray(
        [float(row["_dist_water_km"]) for row in rows], dtype=float
    )
    target = labels == "カッパ"
    observed = float(np.median(distances[target]))
    rng = np.random.default_rng(seed)
    null = np.full(permutations, np.nan, dtype=float)
    unique_strata = [np.where(strata == value)[0] for value in np.unique(strata)]
    for permutation in range(permutations):
        shuffled = labels.copy()
        for indices in unique_strata:
            shuffled[indices] = rng.permutation(shuffled[indices])
        candidate = distances[shuffled == "カッパ"]
        if candidate.size:
            null[permutation] = float(np.median(candidate))
    valid = null[np.isfinite(null)]
    null_median = float(np.median(valid))
    one_sided_smaller = (1 + int(np.sum(valid <= observed))) / (len(valid) + 1)
    distance = abs(observed - null_median)
    two_sided = (
        1 + int(np.sum(np.abs(valid - null_median) >= distance))
    ) / (len(valid) + 1)
    return {
        "alternative_hypothesis": (
            "Kappa-labelled records have a smaller median distance to the "
            "nearest mapped major water feature than expected after shuffling "
            "category labels within prefectures."
        ),
        "admin2_records": len(rows),
        "kappa_records": int(target.sum()),
        "observed_median_km": round(observed, 3),
        "null_distribution_median_km": round(null_median, 3),
        "null_interval_95_km": [
            round(float(np.quantile(valid, 0.025)), 3),
            round(float(np.quantile(valid, 0.975)), 3),
        ],
        "one_sided_p_smaller": round(one_sided_smaller, 6),
        "two_sided_p": round(two_sided, 6),
        "requested_permutations": permutations,
        "valid_permutations": len(valid),
        "seed": seed,
        "result": (
            "not supportive of the physical-proximity hypothesis"
            if observed >= null_median or one_sided_smaller >= 0.05
            else "supports the stated physical-proximity hypothesis"
        ),
        "scope": (
            "Record-level diagnostic on rule-matched municipality representative "
            "points; repeated municipalities and unvalidated matches limit inference."
        ),
    }


def analytic_effect_ratio(
    labels: np.ndarray,
    feature: np.ndarray,
    strata: np.ndarray,
    category: str,
) -> float:
    target = labels == category
    observed = float(feature[target].sum())
    expected = 0.0
    for stratum in np.unique(strata):
        indices = np.where(strata == stratum)[0]
        if len(indices) == 0:
            continue
        expected += (
            float(target[indices].sum())
            * float(feature[indices].sum())
            / len(indices)
        )
    return observed / expected if expected > 0 else math.nan


def term_presence_matrices(
    records: list[dict[str, Any]],
) -> dict[str, dict[str, np.ndarray]]:
    matrices: dict[str, dict[str, np.ndarray]] = {}
    summaries = [record["summary"] for record in records]
    for group, terms in PLACE_FUNCTION_LEXICON.items():
        matrices[group] = {
            term: np.asarray([term in text for text in summaries], dtype=bool)
            for term in terms
        }
    return matrices


def combine_group(
    term_matrices: dict[str, np.ndarray], kept_terms: list[str]
) -> np.ndarray:
    if not kept_terms:
        return np.zeros(
            len(next(iter(term_matrices.values()))), dtype=bool
        )
    stacked = np.vstack([term_matrices[term] for term in kept_terms])
    return np.any(stacked, axis=0)


def strict_interface_vector(
    groups: dict[str, np.ndarray],
    terrain: dict[str, np.ndarray],
    conservative: bool = False,
) -> np.ndarray:
    components = [
        groups["hydrology"] & groups["mobility"],
        groups["hydrology"] & groups["boundary"],
        terrain["mountain"] & groups["mobility"],
        terrain["mountain"] & groups["boundary"],
        terrain["coast"] & groups["mobility"],
        groups["dwelling"] & groups["boundary"],
        groups["death_ritual"] & groups["boundary"],
        groups["livelihood"] & groups["hydrology"],
    ]
    if not conservative:
        components.append(
            groups["hydrology"] & groups["taboo_time_weather"]
        )
    return np.any(np.vstack(components), axis=0)


def robustness_diagnostics(
    records: list[dict[str, Any]],
    seed: int,
    replicates: int,
) -> dict[str, Any]:
    labels = np.asarray([row["major_category"] for row in records], dtype=object)
    strata = np.asarray([row["prefecture"] for row in records], dtype=object)
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
    term_matrices = term_presence_matrices(records)
    full_groups = {
        group: combine_group(term_matrices[group], list(terms))
        for group, terms in PLACE_FUNCTION_LEXICON.items()
    }
    full_strict = strict_interface_vector(full_groups, terrain)
    full_feature_vectors = {
        **full_groups,
        "strict_boundary_interface": full_strict,
    }
    cells = [
        *CONSTRUCT_CELLS.keys(),
        *EXPLICIT_EXPLORATORY_CELLS.keys(),
    ]
    full_ratios = {
        cell: analytic_effect_ratio(
            labels, full_feature_vectors[cell[1]], strata, cell[0]
        )
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
                "_terrain_term_categories": row["terrain_mention_categories"],
            }
            for row in records
        ],
        mask_names=True,
    )
    masked_matrix = feature_matrix(masked_records)
    masked_rows = []
    for category, feature in cells:
        feature_index = FEATURES.index(feature)
        ratio = analytic_effect_ratio(
            labels, masked_matrix[:, feature_index], strata, category
        )
        masked_rows.append(
            {
                "condition": "category-name masking",
                "major_category": category,
                "category_label": CATEGORY_LABELS.get(category, category),
                "feature": feature,
                "feature_label": FEATURE_LABELS[feature],
                "effect_ratio": round(ratio, 5),
                "full_dictionary_effect_ratio": round(
                    full_ratios[(category, feature)], 5
                ),
                "relative_to_full": round(
                    ratio / full_ratios[(category, feature)], 5
                )
                if full_ratios[(category, feature)] > 0
                else None,
            }
        )

    drop_rows: list[dict[str, Any]] = []
    rank_rows: list[dict[str, Any]] = []
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
            analytic_effect_ratio(
                labels, full_feature_vectors[feature], strata, category
            )
            for category, feature in rank_cells
        ],
        dtype=float,
    )
    for drop_rate in (0.10, 0.20, 0.30):
        for replicate in range(replicates):
            rng = random.Random(seed + int(drop_rate * 1000) + replicate)
            kept: dict[str, list[str]] = {}
            for group, terms in PLACE_FUNCTION_LEXICON.items():
                term_list = list(terms)
                keep_n = max(1, round(len(term_list) * (1 - drop_rate)))
                kept[group] = sorted(rng.sample(term_list, k=keep_n))
            groups = {
                group: combine_group(term_matrices[group], terms)
                for group, terms in kept.items()
            }
            feature_vectors = {
                **groups,
                "strict_boundary_interface": strict_interface_vector(
                    groups, terrain
                ),
            }
            replicate_rank_values = np.asarray(
                [
                    analytic_effect_ratio(
                        labels, feature_vectors[feature], strata, category
                    )
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
                ratio = analytic_effect_ratio(
                    labels, feature_vectors[feature], strata, category
                )
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
                            ratio / full_ratios[(category, feature)]
                            if full_ratios[(category, feature)] > 0
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
            stability = np.asarray(
                [row["relative_to_full"] for row in selected], dtype=float
            )
            drop_summary.append(
                {
                    "drop_rate": drop_rate,
                    "replicates": len(selected),
                    "major_category": category,
                    "category_label": CATEGORY_LABELS.get(category, category),
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
                        float(np.median(stability)), 5
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
    strict_ratio = analytic_effect_ratio(
        labels, full_strict, strata, snake
    )
    conservative_vector = strict_interface_vector(
        full_groups, terrain, conservative=True
    )
    conservative_ratio = analytic_effect_ratio(
        labels, conservative_vector, strata, snake
    )
    environmental = (
        full_groups["hydrology"]
        | full_groups["livelihood"]
        | terrain["water"]
        | terrain["mountain"]
        | terrain["coast"]
    )
    human_condition = (
        full_groups["actors"]
        | full_groups["actions"]
        | full_groups["taboo_time_weather"]
    )
    broad_vector = environmental & human_condition
    broad_ratio = analytic_effect_ratio(
        labels, broad_vector, strata, snake
    )
    interface_ablation = [
        {
            "definition": "Broad environmental × human-condition",
            "snake_dragon_effect_ratio": round(broad_ratio, 5),
        },
        {
            "definition": "Strict derived interfaces",
            "snake_dragon_effect_ratio": round(strict_ratio, 5),
        },
        {
            "definition": "Conservative strict interfaces",
            "snake_dragon_effect_ratio": round(conservative_ratio, 5),
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


def dictionary_manifest() -> dict[str, Any]:
    payload = {
        "dictionary_version": DICTIONARY_VERSION,
        "dictionary_date": DICTIONARY_DATE,
        "place_function_lexicon": PLACE_FUNCTION_LEXICON,
        "textual_landscape_lexicon": TERRAIN_KEYWORD_CATEGORIES,
        "category_surface_forms_for_masking": CATEGORY_SURFACE_FORMS,
        "place_description_categories": sorted(PLACE_DESCRIPTION_CATEGORIES),
        "human_condition_categories": sorted(HUMAN_CONDITION_CATEGORIES),
        "broad_interface_definition": (
            "(hydrology or livelihood or water/mountain/coast mention) AND "
            "(actors or actions or taboo/time/weather)"
        ),
        "strict_interface_definitions": {
            "water crossing": "hydrology AND mobility",
            "waterside boundary": "hydrology AND boundary",
            "water danger norm": "hydrology AND taboo/time/weather",
            "mountain route": "mountain mention AND mobility",
            "mountain boundary": "mountain mention AND boundary",
            "coastal landing": "coast mention AND mobility",
            "domestic threshold": "dwelling AND boundary",
            "mortuary boundary": "death ritual AND boundary",
            "water livelihood": "livelihood AND hydrology",
        },
    }
    return {**payload, "sha256": stable_hash(payload)}


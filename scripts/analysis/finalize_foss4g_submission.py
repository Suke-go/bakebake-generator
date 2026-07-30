#!/usr/bin/env python3
"""Validate and seal the revised manuscript in the latest FOSS4G format."""

from __future__ import annotations

import csv
import hashlib
import json
import re
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import fitz
import pandas as pd


ROOT = Path(__file__).resolve().parents[2]
PAPER = ROOT / "paper" / "foss4g-yokai-geo"
OUT = ROOT / "analysis" / "isprs_yokai_geo_canonical"
RESULTS = OUT / "results.json"
BASE_MANIFEST = OUT / "run_manifest.json"
TEX = PAPER / "main_submission_revised.tex"
BIB = PAPER / "refs_revised.bib"
LOG = PAPER / "main_submission_revised.log"
PDF = PAPER / "main_submission_revised.pdf"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def git_output(*args: str) -> str:
    result = subprocess.run(
        ["git", *args],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    return result.stdout.strip()


def expand_inputs(text: str, seen: set[Path] | None = None) -> str:
    seen = seen or set()
    pattern = re.compile(r"\\input\{([^}]+)\}")

    def replace(match: re.Match[str]) -> str:
        path = PAPER / f"{match.group(1)}.tex"
        if path in seen or not path.exists():
            return match.group(0)
        seen.add(path)
        return expand_inputs(path.read_text(encoding="utf-8"), seen)

    return pattern.sub(replace, text)


def replace_macros(text: str, macros: str) -> str:
    for name, value in re.findall(
        r"\\newcommand\{\\([A-Za-z]+)\}\{([^}]*)\}", macros
    ):
        text = text.replace(f"\\{name}{{}}", value)
        text = text.replace(f"\\{name}", value)
    return text


def abstract_word_count(source: str, macros: str) -> int:
    marker = r"{\noindent\textbf{Abstract}\par}"
    start = source.index(marker) + len(marker)
    block = source[start : source.index(r"\vspace{1.5em}", start)]
    block = replace_macros(block, macros)
    block = re.sub(r"\\[A-Za-z]+\*?(?:\[[^\]]*\])?", " ", block)
    block = block.replace("{", " ").replace("}", " ")
    return len(re.findall(r"[A-Za-z0-9]+(?:[-窶転[A-Za-z0-9]+)*", block))


def label_audit(expanded: str, source: str) -> tuple[dict[str, Any], list[str]]:
    failures: list[str] = []
    labels = re.findall(r"\\label\{((?:fig|tab):[^}]+)\}", expanded)
    refs = re.findall(r"\\ref\{((?:fig|tab):[^}]+)\}", source)
    missing_refs = sorted(set(labels) - set(refs))
    undefined_refs = sorted(set(refs) - set(labels))
    if missing_refs:
        failures.append(f"uncited labels: {missing_refs}")
    if undefined_refs:
        failures.append(f"undefined labels: {undefined_refs}")
    for prefix in ("fig:", "tab:"):
        declared = [label for label in labels if label.startswith(prefix)]
        first_refs = sorted(
            (
                (source.find(rf"\ref{{{label}}}"), label)
                for label in declared
                if source.find(rf"\ref{{{label}}}") >= 0
            )
        )
        reference_order = [label for _, label in first_refs]
        if reference_order != declared:
            failures.append(
                f"{prefix[:-1]} reference order {reference_order} "
                f"does not match declaration order {declared}"
            )
    return {
        "labels": labels,
        "references": refs,
        "uncited_labels": missing_refs,
        "undefined_labels": undefined_refs,
    }, failures


def citation_audit(source: str, bib: str) -> tuple[dict[str, Any], list[str]]:
    failures: list[str] = []
    cited: set[str] = set()
    for group in re.findall(r"\\cite(?:p|t)?\{([^}]+)\}", source):
        cited.update(key.strip() for key in group.split(","))
    entries = set(re.findall(r"@\w+\{([^,\s]+)", bib))
    missing = sorted(cited - entries)
    unused = sorted(entries - cited)
    if missing:
        failures.append(f"citation keys missing from bibliography: {missing}")
    if unused:
        failures.append(f"unused bibliography entries: {unused}")
    return {
        "cited_keys": sorted(cited),
        "bibliography_keys": sorted(entries),
        "missing": missing,
        "unused": unused,
    }, failures


def main() -> None:
    result = json.loads(RESULTS.read_text(encoding="utf-8"))
    manifest = json.loads(BASE_MANIFEST.read_text(encoding="utf-8"))
    source = TEX.read_text(encoding="utf-8")
    expanded = expand_inputs(source)
    bib = BIB.read_text(encoding="utf-8")
    log = LOG.read_text(encoding="utf-8", errors="replace")
    macros = (PAPER / "generated_numbers.tex").read_text(encoding="utf-8")
    failures: list[str] = []
    checks: dict[str, Any] = {}

    counts = result["evidence_channels"]["counts"]
    broad_count = counts["broad_human_environment_interface"]
    human_count = counts["human_condition_evidence"]
    checks["broad_interface_subset_totals"] = {
        "broad_interface": broad_count,
        "human_condition": human_count,
        "passed": broad_count <= human_count,
    }
    if broad_count > human_count:
        failures.append("broad interface total exceeds human-condition total")

    evidence = pd.read_csv(OUT / "evidence_channel_records.csv")
    violations = int(
        (
            evidence["has_broad_interface"].astype(bool)
            & ~evidence["has_human_condition"].astype(bool)
        ).sum()
    )
    checks["broad_interface_subset_records"] = {
        "records": int(len(evidence)),
        "violations": violations,
        "passed": violations == 0,
    }
    if violations:
        failures.append(f"{violations} broad-interface records lack human condition")

    record_count_ok = len(evidence) == result["archive"]["cleaned_records"]
    checks["record_count_consistency"] = {
        "results": result["archive"]["cleaned_records"],
        "evidence_rows": int(len(evidence)),
        "passed": record_count_ok,
    }
    if not record_count_ok:
        failures.append("evidence row count differs from canonical record count")

    associations = pd.read_csv(OUT / "archive_language_associations.csv")
    association_ok = (
        len(associations) == 120
        and associations["valid_permutations"].eq(10000).all()
        and associations["benjamini_hochberg_q"].notna().all()
        and associations["odds_ratio"].notna().all()
        and associations["odds_ratio_ci_low"].notna().all()
        and associations["odds_ratio_ci_high"].notna().all()
    )
    checks["association_inference"] = {
        "cells": int(len(associations)),
        "all_permutations_10000": bool(
            associations["valid_permutations"].eq(10000).all()
        ),
        "all_q_values_present": bool(
            associations["benjamini_hochberg_q"].notna().all()
        ),
        "all_effect_intervals_present": bool(
            associations[
                ["odds_ratio", "odds_ratio_ci_low", "odds_ratio_ci_high"]
            ].notna().all().all()
        ),
        "passed": bool(association_ok),
    }
    if not association_ok:
        failures.append("association inference output is incomplete")

    rank = pd.read_csv(OUT / "dictionary_rank_correlation_replicates.csv")
    rank_counts = rank.groupby("drop_rate", dropna=False).size().astype(int).to_dict()
    robustness_ok = len(rank_counts) == 3 and all(v == 100 for v in rank_counts.values())
    checks["robustness_replicates"] = {
        "counts_by_rate": {str(k): v for k, v in rank_counts.items()},
        "passed": robustness_ok,
    }
    if not robustness_ok:
        failures.append("dictionary robustness does not contain 100 runs per rate")

    threshold = pd.read_csv(OUT / "threshold_sensitivity.csv")
    threshold_ok = len(threshold) == 18
    checks["threshold_sensitivity"] = {
        "rows": int(len(threshold)),
        "passed": threshold_ok,
    }
    if not threshold_ok:
        failures.append("threshold sensitivity should contain 18 rows")

    labels, label_failures = label_audit(expanded, source)
    checks["labels"] = labels
    failures.extend(label_failures)
    citations, citation_failures = citation_audit(source, bib)
    checks["citations"] = citations
    failures.extend(citation_failures)

    banned = [
        r"\bvalley\b",
        r"\bdistortion\b",
        r"\buncertainty-aware\b",
        r"\bdeeply spatial\b",
        r"evaluated separately",
        r"conservative matching",
        r"The system described here is designed around FOSS4G principles",
        r"\binland_water\b",
        r"\bCramers V\b",
    ]
    banned_hits = [pattern for pattern in banned if re.search(pattern, source, re.I)]
    checks["banned_terminology"] = {"hits": banned_hits, "passed": not banned_hits}
    if banned_hits:
        failures.append(f"banned terminology remains: {banned_hits}")

    log_hits = [
        token
        for token in (
            "Overfull \\hbox",
            "Citation `",
            "Reference `",
            "undefined references",
            "undefined citations",
            "Fatal error",
            "Emergency stop",
        )
        if token in log
    ]
    checks["latex_log"] = {"hits": log_hits, "passed": not log_hits}
    if log_hits:
        failures.append(f"LaTeX log contains: {log_hits}")

    word_count = abstract_word_count(source, macros)
    abstract_ok = 100 <= word_count <= 250
    checks["abstract_length"] = {
        "words": word_count,
        "required_range": [100, 250],
        "passed": abstract_ok,
    }
    if not abstract_ok:
        failures.append(f"abstract word count is {word_count}")

    format_signatures = [
        r"\documentclass[9pt,twocolumn,a4paper]{extarticle}",
        r"\geometry{a4paper,top=25mm,bottom=25mm,left=20mm,right=20mm,columnsep=6mm}",
        r"\fontsize{12}{14}\selectfont\bfseries",
        r"\fontsize{10}{12}\selectfont",
        r"\fontsize{9}{11}\selectfont",
        "University of Tsukuba",
        "Japan Women's University",
    ]
    missing_signatures = [item for item in format_signatures if item not in source]
    checks["latest_format_baseline"] = {
        "missing_signatures": missing_signatures,
        "passed": not missing_signatures,
    }
    if missing_signatures:
        failures.append(f"latest FOSS4G format signatures missing: {missing_signatures}")

    document = fitz.open(PDF)
    page_text_lengths = [len(page.get_text()) for page in document]
    pdf_ok = 6 <= len(document) <= 8 and all(length > 100 for length in page_text_lengths)
    checks["pdf"] = {
        "pages": len(document),
        "page_text_lengths": page_text_lengths,
        "all_pages_nonempty": all(length > 100 for length in page_text_lengths),
        "passed": pdf_ok,
    }
    if not pdf_ok:
        failures.append("PDF page count or nonempty-page check failed")

    figure_files = [
        PAPER / "figures" / f"fig{index}_{name}.pdf"
        for index, name in (
            (1, "crown_jewel"),
            (2, "evidence_coverage"),
            (3, "resolution_sensitivity"),
            (4, "archive_language_effects"),
        )
    ]
    figure_audit = []
    for path in figure_files:
        figure = fitz.open(path)
        visible_text = "\n".join(page.get_text() for page in figure)
        figure_audit.append(
            {
                "path": str(path.relative_to(ROOT)),
                "exists": path.exists(),
                "pages": len(figure),
                "sha256": sha256(path),
                "visible_underscore": "_" in visible_text,
            }
        )
    figures_ok = all(
        item["exists"] and item["pages"] == 1 and not item["visible_underscore"]
        for item in figure_audit
    )
    checks["vector_figures"] = {"items": figure_audit, "passed": figures_ok}
    if not figures_ok:
        failures.append("figure PDF existence/page/text-label check failed")

    old_artifacts = [
        OUT / "manual_validation_sample_200.csv",
        OUT / "manual_validation_codebook.md",
        OUT / "fig_resolution_distortion.pdf",
        PAPER / "figures" / "fig_resolution_distortion.pdf",
    ]
    existing_old = [str(path.relative_to(ROOT)) for path in old_artifacts if path.exists()]
    checks["obsolete_artifacts_removed"] = {
        "remaining": existing_old,
        "passed": not existing_old,
    }
    if existing_old:
        failures.append(f"obsolete artifacts remain: {existing_old}")

    manual_ok = (
        not result["configuration"]["manual_gold_evaluation"]
        and not result["evidence_channels"]["extraction_evaluation"][
            "precision_recall_f1_reported"
        ]
    )
    checks["manual_gold_evaluation"] = {
        "configured": result["configuration"]["manual_gold_evaluation"],
        "precision_recall_f1_reported": result["evidence_channels"][
            "extraction_evaluation"
        ]["precision_recall_f1_reported"],
        "passed": manual_ok,
    }
    if not manual_ok:
        failures.append("manual evaluation state is inconsistent")

    qa = {
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
        "status": "PASS" if not failures else "FAIL",
        "checks": checks,
        "failures": failures,
    }
    qa_path = OUT / "manuscript_qa_foss4g.json"
    qa_path.write_text(
        json.dumps(qa, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    artifacts = [
        RESULTS,
        OUT / "dictionary_manifest.json",
        OUT / "archive_language_associations.csv",
        OUT / "focal_associations.csv",
        OUT / "qualitative_examples.csv",
        OUT / "dictionary_deletion_replicates.csv",
        OUT / "dictionary_rank_correlation_replicates.csv",
        OUT / "support_polygon_metrics.csv",
        OUT / "support_refinement_comparison.csv",
        OUT / "threshold_sensitivity.csv",
        OUT / "evidence_channel_records.csv",
        OUT / "number_source_map.csv",
        qa_path,
        TEX,
        PDF,
        BIB,
        PAPER / "REVISION_SUMMARY.md",
        PAPER / "SECTION_OUTLINE.md",
        PAPER / "CHANGELOG_REVISED.md",
        PAPER / "TODO_AUTHOR.md",
        PAPER / "CLAIMS_SCOPE.md",
        PAPER / "DELIVERABLES_FOSS4G.md",
        PAPER / "requirements-paper-lock.txt",
        *figure_files,
    ]
    artifact_hashes = {
        str(path.relative_to(ROOT)): sha256(path) for path in artifacts
    }
    refreshed_outputs = {}
    for name in manifest["expected_outputs"]:
        path = OUT / name
        if path.exists():
            refreshed_outputs[name] = sha256(path)

    head = git_output("rev-parse", "HEAD")
    remote_head = git_output("rev-parse", "personal/main")
    final_manifest = dict(manifest)
    final_manifest["finalization_timestamp_utc"] = datetime.now(timezone.utc).isoformat()
    final_manifest["final_git_base_commit"] = head
    final_manifest["personal_main_commit"] = remote_head
    final_manifest["latest_remote_synchronised"] = head == remote_head
    final_manifest["final_git_tracked_worktree_dirty"] = bool(
        git_output("status", "--porcelain", "--untracked-files=no")
    )
    final_manifest["format_baseline"] = (
        "paper/foss4g-yokai-geo/main.tex at personal/main"
    )
    final_manifest["submission_candidate"] = (
        "paper/foss4g-yokai-geo/main_submission_revised.tex"
    )
    final_manifest["presentation_command"] = (
        "python scripts/analysis/prepare_foss4g_submission_v1.py "
        "then latexmk -pdf -interaction=nonstopmode -halt-on-error "
        "main_submission_revised.tex in paper/foss4g-yokai-geo"
    )
    final_manifest["qa_status"] = qa["status"]
    final_manifest["qa_report"] = "manuscript_qa_foss4g.json"
    final_manifest["output_sha256"] = refreshed_outputs
    final_manifest["final_artifact_sha256"] = artifact_hashes
    final_manifest["manual_gold_labels_created"] = False
    final_manifest["source_excerpt_redistribution"] = (
        "WITHHELD: TODO-AUTHOR confirm source database terms"
    )
    final_manifest_path = OUT / "run_manifest_foss4g_final.json"
    final_manifest_path.write_text(
        json.dumps(final_manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    inventory_path = OUT / "artifact_inventory_foss4g.csv"
    with inventory_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(["path", "sha256"])
        writer.writerows(sorted(artifact_hashes.items()))

    print(json.dumps({"status": qa["status"], "failures": failures}, indent=2))
    if failures:
        raise SystemExit(1)


if __name__ == "__main__":
    main()

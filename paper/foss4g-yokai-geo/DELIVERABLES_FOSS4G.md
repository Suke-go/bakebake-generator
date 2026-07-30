# FOSS4G revision deliverables

The latest `personal/main` version is used as the formatting and author-metadata
baseline. Its scientific body is retained only as provenance; the submission
candidate is `main_submission_revised.tex`.

## Submission candidate

- `main_submission_revised.tex`: fully revised LaTeX manuscript in the latest
  FOSS4G two-column format.
- `main_submission_revised.pdf`: compiled seven-page submission candidate.
- `refs_revised.bib`: verified, used-only bibliography.
- `requirements-paper-lock.txt`: pinned canonical-analysis packages.
- `generated_numbers.tex`: manuscript macros generated from the canonical
  result.
- `generated_table_*_submission.tex`: generated submission tables.
- `figures/fig1_crown_jewel.pdf` through
  `figures/fig4_archive_language_effects.pdf`: vector figures.

## Canonical evidence

The canonical outputs are in
`../../analysis/isprs_yokai_geo_canonical/`. The principal files are:

- `results.json`
- `run_manifest_foss4g_final.json`
- `manuscript_qa_foss4g.json`
- `number_source_map.csv`
- `evidence_channel_records.csv`
- `support_polygon_metrics.csv`
- `support_refinement_comparison.csv`
- `archive_language_associations.csv`
- `focal_associations.csv`
- `dictionary_deletion_replicates.csv`
- `dictionary_rank_correlation_replicates.csv`
- `threshold_sensitivity.csv`

`qualitative_examples.csv` contains source excerpts and must not be
redistributed until `TODO-AUTHOR` confirms the source-database terms.

## Editorial documentation

- `REVISION_SUMMARY.md`: revised Claim, Title, Abstract, RQs, and contribution.
- `SECTION_OUTLINE.md`: revised section structure.
- `CHANGELOG_REVISED.md`: change log.
- `TODO_AUTHOR.md`: unresolved author-only items.
- `CLAIMS_SCOPE.md`: claims supported and not supported by current data.

## Reproduction

From the repository root:

```text
python scripts/analysis/isprs_canonical_pipeline_v2.py
python scripts/analysis/prepare_foss4g_submission_v1.py
cd paper/foss4g-yokai-geo
latexmk -pdf -interaction=nonstopmode -halt-on-error main_submission_revised.tex
```

No human gold labels were created. Coverage is not reported as extraction
accuracy, and precision, recall, or F1 are not claimed.

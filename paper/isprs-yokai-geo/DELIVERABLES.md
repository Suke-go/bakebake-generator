# Deliverables

- Submission manuscript: `main_submission.tex`
- Built PDF: `main_submission.pdf`
- Verified bibliography: `refs_revised.bib`
- Revised claim, title, abstract, RQs, and contribution:
  `REVISION_SUMMARY.md`
- Revised section structure: `SECTION_OUTLINE.md`
- Change log: `CHANGELOG_REVISED.md`
- Unresolved author confirmations: `TODO_AUTHOR.md`
- Supported/unsupported claims: `CLAIMS_SCOPE.md`
- Exact environment pins: `requirements-isprs-lock.txt`
- Canonical results: `../../analysis/isprs_yokai_geo_canonical/results.json`
- Final run manifest:
  `../../analysis/isprs_yokai_geo_canonical/run_manifest_final.json`
- Number-to-source map:
  `../../analysis/isprs_yokai_geo_canonical/number_source_map.csv`
- Vector figures: `figures/fig1_crown_jewel.pdf` through
  `figures/fig4_archive_language_effects.pdf`
- Result-backed tables: `generated_table_*_submission.tex`
- Mechanical QA report:
  `../../analysis/isprs_yokai_geo_canonical/manuscript_qa.json`

Canonical analysis:

```text
python scripts/analysis/isprs_canonical_pipeline_v2.py
```

Final manuscript preparation and build:

```text
python scripts/analysis/prepare_isprs_submission_v8.py
latexmk -pdf -interaction=nonstopmode -halt-on-error main_submission.tex
```

The local `qualitative_examples.csv` contains source excerpts and must not be
redistributed until the source terms are confirmed.

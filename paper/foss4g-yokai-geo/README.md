# FOSS4G Yokai Geography Paper

This directory contains the paper draft for the open-source yokai geography visualization pipeline.

Main files:

- `main.tex`: current paper source.
- `main.pdf`: compiled paper.
- `refs.bib`: bibliography.
- `main.md`: earlier Markdown draft; the LaTeX/PDF version is authoritative.
- `../../data/nichibun/nichibun_ner.json`: full GiNZA place and terrain-term extraction.
- `../../data/nichibun/nichibun_enriched.json`: current text-aware terrain-enriched dataset.
- `../../analysis/yokai_geo_validation/validation_summary.json`: full extraction and validation diagnostics.
- `../../analysis/yokai_geo_validation/manual_review_sample.csv`: reproducible 200-record manual review sample.
- `../../analysis/yokai_geo_validation/manual_review_codebook.md`: coding guide for manual NER evaluation.
- `../../analysis/yokai_geo_validation/nominatim_workload_estimate.json`: local/cached geocoding workload estimate.
- `../../analysis/yokai_geo/experiment_summary.json`: experiment summary with manifest and guardrail.
- `../../analysis/yokai_geo/category_terrain_table.csv`: category by terrain table.
- `../../analysis/yokai_geo/category_distance_stats.csv`: coast and water distance summary.
- `../../analysis/yokai_geo/category_kyoto_distance_stats.csv`: Kyoto distance summary.
- `../../analysis/yokai_geo/category_terrain_standardized_residuals.csv`: chi-square residual diagnostics.
- `../../analysis/yokai_geo/other_exclusion_sensitivity.json`: Other-category sensitivity check.
- `../../analysis/yokai_geo/prefecture_centroid_bias_diagnostics.csv`: centroid-bias diagnostics.
- `../../analysis/yokai_geo/fig_category_terrain_proportions.png`: terrain composition figure.
- `../../analysis/yokai_geo/fig_category_terrain_standardized_residuals.png`: residual heatmap.
- `../../analysis/yokai_geo/fig_category_median_coast_distance.png`: coast distance figure.
- `../../analysis/yokai_geo/fig_category_median_kyoto_distance.png`: Kyoto distance figure.
- `../../analysis/yokai_geo/fig_prefecture_centroid_bias.png`: centroid-bias figure.
- `../../analysis/yokai_geo/fig_records_by_terrain.png`: point distribution figure.
- `../../analysis/yokai_geo_validation/fig_ner_coverage_by_category.png`: GiNZA place extraction coverage figure.
- `../../analysis/yokai_geo_validation/fig_terrain_term_coverage_by_category.png`: terrain term coverage figure.
- `../../analysis/yokai_geo_validation/fig_terrain_terms_vs_centroid_class.png`: terrain term versus assigned class diagnostic.

Reproduce the reported full-extraction baseline:

```bash
python scripts/analysis/geocode_prefecture.py
python scripts/analysis/extract_place_names.py
python scripts/analysis/geocode_nominatim.py --input data/nichibun/nichibun_ner.json --output data/nichibun/nichibun_georef_final.json --cache data/nichibun/nominatim_cache.json --dry-run
python scripts/analysis/terrain_enrich.py --input data/nichibun/nichibun_ner.json --output data/nichibun/nichibun_enriched.json
python scripts/analysis/yokai_geo_validation.py
python scripts/analysis/yokai_geo_experiments.py
```

The current paper deliberately reports the Nominatim stage as a dry-run workload estimate unless a local or frozen geocoding cache is supplied. The enriched dataset therefore remains a full-coverage, prefecture-centroid baseline with text-aware terrain classes, not a municipality-resolution claim.

Data policy:

- `data/nichibun/` contains generated Nichibun-derived working data and is not committed.
- `data/geo/` keeps only lightweight metadata or derived layers. Raw downloads, extracted shapefiles, and the full MLIT W05 river GeoJSON are ignored and should be regenerated locally.
- The committed `analysis/yokai_geo*` directories contain lightweight CSV/JSON/PNG diagnostics used by the paper.

Run the map:

```bash
npm run dev
```

Open `http://localhost:3000/map`.

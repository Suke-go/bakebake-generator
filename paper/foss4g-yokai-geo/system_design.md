# FOSS4G Yokai Geography System Design

This design maps the intended FOSS4G paper argument to a defensible open-source system architecture. It separates the implemented baseline from the additional work required to support stronger claims about municipality-level geocoding, terrain-aware analysis, and Yanagita-style geographic hypotheses.

## Target Claim

The paper should claim that the system is an open-source geographic visualization and enrichment pipeline for the Nichibun Kaii-Yokai Densho Database. It transforms text-and-table folklore records into interactive, uncertainty-aware geospatial data, enabling researchers to inspect terrain clustering and diffusion hypotheses.

The strongest defensible wording is:

> We present a reproducible FOSS4G pipeline that georeferences Nichibun yokai records, enriches them with terrain context, and serves them through an interactive MapLibre interface. The current prefecture-centroid experiment validates the data-processing path and establishes a baseline; higher-resolution geocoding and manual evaluation are required before making fine-grained ecological claims.

Avoid claiming that the current data already proves kappa cluster near rivers or tengu cluster in mountains unless the municipality/locality geocoding and finer terrain layers have been completed and evaluated.

## System Overview

The system has five layers:

1. Data preparation
2. Location extraction and geocoding
3. Terrain enrichment
4. GeoJSON API
5. Interactive map and analysis views

Each layer writes auditable intermediate files so that researchers can inspect errors, rerun only part of the pipeline, and replace components with local or higher-quality alternatives.

## Stage 1: Data Preparation and Georeferencing

### Input

- `data/nichibun/nichibun_cleaned.json`
- Required fields:
  - `id`
  - `name`
  - `summary`
  - `prefecture`
  - `major_category`
  - `phenomenon`

### 1-A Prefecture Centroid Baseline

Script:

- `scripts/analysis/geocode_prefecture.py`

Output:

- `data/nichibun/nichibun_georef.json`

Record additions:

- `_lat`
- `_lng`
- `_geo_level = "prefecture"`
- `_geocode_source = "prefecture_centroid"`
- `_geocode_confidence = 0.25`

Purpose:

- Guarantees 100% geographic coverage.
- Provides a conservative baseline.
- Makes geocoding uncertainty explicit.

Paper framing:

- This is a baseline, not a fine-grained event location.
- All figures based only on this stage must be labeled "prefecture-centroid".

### 1-B GiNZA Place and Terrain Extraction

Script:

- `scripts/analysis/extract_place_names.py`

Output:

- `data/nichibun/nichibun_ner.json`
- `data/nichibun/ner_cache.json`

Record additions:

- `_place_mentions`
- `_place_mention_spans`
- `_terrain_terms`
- `_terrain_term_categories`

Recommended terrain vocabulary:

- water: river, pond, lake, marsh, irrigation, well, waterfall
- mountain: mountain, ridge, forest, cave, rock, slope
- boundary: pass, road, bridge, crossroads, village edge
- coast: sea, beach, shore, cape, island
- agrarian: rice paddy, field, village, hamlet

Evaluation required for non-FOSS4G venues:

- Random 200-record manual annotation.
- Report precision, recall, and F1 for place mentions.
- Report terrain-term false positives and false negatives.
- Separate formal toponyms from common terrain nouns.

Current full-run diagnostics:

- Records processed: 33,378.
- Records with at least one extracted place mention: 9,361 (28.1%).
- Records with at least one terrain term: 20,242 (60.6%).
- A reproducible 200-record review sample and coding guide are written to `analysis/yokai_geo_validation/`.

### 1-C Higher-Resolution Geocoding

Script:

- `scripts/analysis/geocode_nominatim.py`

Output:

- `data/nichibun/nichibun_georef_final.json`
- `data/nichibun/nominatim_cache.json`

Geocoding strategy:

1. Query place mentions with prefecture context.
2. Restrict to Japan.
3. Reject results whose returned prefecture conflicts with source metadata.
4. Cache every query and response.
5. Preserve fallback coordinates when refinement fails.

Recommended record additions:

- `_geocoded_place`
- `_geocode_source`
- `_geo_level`
- `_geocode_confidence`
- `_geocode_rejection_reason`
- `_nominatim_raw`

Resolution classes:

- `prefecture`
- `municipality`
- `locality`
- `landmark`
- `historical_or_uncertain`

Production requirement:

- Do not use public Nominatim for uncontrolled full-archive batch reproduction.
- Use a local Nominatim instance, institutional geocoding cache, or frozen query cache for paper experiments.
- The current dry-run identified 9,015 unique prefecture-place queries, implying at least 2.5 hours at the public 1 request/second limit before retry overhead. The public batch run should not be treated as the default reproducibility path.

To support a claim such as "70% municipality-level or finer":

- Report exact numerator and denominator.
- Report rejection count.
- Report unresolved count.
- Report manually evaluated precision on a stratified sample.
- Publish or archive the cache if licensing permits.

## Stage 2: Terrain Enrichment

Script:

- `scripts/analysis/terrain_enrich.py`

Current implemented open layers:

- GADM Japan level 2 administrative boundaries
- Natural Earth rivers
- Natural Earth lakes
- Natural Earth coastline

Recommended stronger layers for a stronger journal submission:

- Japanese national river and lake data
- DEM-derived elevation
- DEM-derived slope
- land cover
- historical administrative gazetteer
- road/pass/bridge layers where available

Record additions:

- `_admin2`
- `_dist_water_km`
- `_dist_coast_km`
- `_elevation_m`
- `_slope_deg`
- `_landcover_buffer`
- `_terrain_class`
- `_terrain_evidence`

Terrain class logic:

- `coastal`: coast distance below threshold.
- `waterside`: water distance below threshold.
- `mountain`: elevation/slope threshold or mountain terrain terms.
- `boundary`: pass, bridge, road, crossroads, or administrative boundary proximity.
- `plain`: low elevation, low slope, not coastal or waterside.
- `unknown`: insufficient evidence.

The classifier must output evidence, not just labels. Example:

```json
{
  "_terrain_class": "waterside",
  "_terrain_evidence": {
    "dist_water_km": 0.8,
    "terrain_terms": ["川"],
    "geo_level": "municipality"
  }
}
```

## Stage 3: API

Files:

- `src/app/api/yokai-geo/route.ts`
- `src/lib/yokai-geo.ts`

Endpoint:

- `/api/yokai-geo`

Required query parameters:

- `category`
- `geo_level`
- `terrain_class`
- `limit`
- `include_summary`

Recommended additional parameters:

- `min_confidence`
- `bbox`
- `source_period`
- `dist_water_max`
- `dist_coast_max`
- `include_uncertain`

Response:

- GeoJSON FeatureCollection.
- Include metadata as a GeoJSON foreign member.

Required metadata:

- dataset version
- source file identifier
- total records
- returned records
- filter summary
- geo-level counts
- terrain-class counts
- coordinate reference system
- pipeline stage
- input hash

## Stage 4: Map Interface

Files:

- `src/app/map/page.tsx`
- `src/components/YokaiMap.tsx`

Views:

1. Points
2. Density
3. Terrain

### Points View

Purpose:

- Close reading of individual records.

Required features:

- Major category color.
- Popup with name, category, prefecture, summary, geo level, terrain class.
- Legend.
- Category filter.
- Confidence or resolution indicator.

### Density View

Purpose:

- Large-scale concentration patterns.

Implementation:

- MapLibre heatmap layer.

Required guardrail:

- Density must be interpreted as archive-record density, not population-normalized belief density.

Recommended improvement:

- Toggle between raw density and prefecture-normalized density.

### Terrain View

Purpose:

- Compare yokai records with coast, water, elevation, and terrain bands.

Required features:

- Color records by terrain band.
- Dist coast slider.
- Dist water slider.
- Geo-level filter.
- Uncertainty display.

Recommended improvement:

- Hillshade or terrain raster.
- Hydrology overlay.
- Show only municipality/locality records when testing terrain hypotheses.

## Stage 5: Experiments for the Paper

The current experiment is a prefecture-centroid baseline. It supports a FOSS4G pipeline paper but not a strong folklore geography proof.

### Experiment A: Baseline Coverage

Report:

- total cleaned records
- records geocoded at prefecture level
- missing prefectures
- category counts

Current result:

- 33,378 records
- 100% prefecture centroid coverage

### Experiment B: Terrain Baseline

Report:

- terrain class counts
- centroid-bias diagnostic
- category by terrain table
- chi-square and Cramer's V
- residuals
- Other-exclusion sensitivity

Current text-aware baseline result:

- coastal: 17,983
- plain: 10,151
- mountain: 4,056
- valley: 861
- inland_water: 327
- chi-square: 2090.40
- df: 44
- p: < 1e-300
- Cramer's V: 0.125
- Other-excluded Cramer's V: 0.173

Interpretation:

- Detectable but modest association.
- Useful as diagnostic baseline.
- Not fine-grained ecological evidence, because all current coordinates remain prefecture centroids.

### Experiment C: Geocoding Evaluation

Required before claiming municipality-level performance:

- Run NER.
- Run cached/local Nominatim or gazetteer.
- Report resolution distribution.
- Manually evaluate geocoding precision.
- Report common error types:
  - obsolete place names
  - shrine names
  - ambiguous settlements
  - terrain nouns mistaken for toponyms
  - prefecture mismatch

### Experiment D: Terrain Hypothesis Case Studies

Recommended categories:

- Kappa for waterside association.
- Tengu for mountain association.
- Kitsune for plain/settlement-edge association.

Required controls:

- geocoding confidence
- prefecture record density
- source bias
- category imbalance

### Experiment E: Diffusion Proxy

Kyoto distance can be included only as an exploratory feature.

Do not claim a test of Yanagita's concentric diffusion theory unless using:

- source period
- place resolution
- category-specific models
- uncertainty-aware regression
- comparison against alternative centers

## Paper Structure

Recommended FOSS4G paper sections:

1. Introduction
2. Related Work and Motivation
3. Data
4. System Pipeline
5. API and Interface
6. Reproducible Baseline Experiment
7. Discussion
8. Limitations
9. Conclusion

Recommended core argument:

- Text-only folklore archives block spatial reasoning.
- A FOSS4G pipeline can make spatial structure inspectable.
- The prefecture-centroid baseline validates the processing path and exposes uncertainty.
- Higher-resolution geocoding is the next required step for hypothesis testing.

## Claims Checklist

Safe now:

- 33,378 cleaned records processed.
- 100% prefecture-centroid coverage.
- Full GiNZA extraction completed on all records.
- 9,361 records include place mentions; 20,242 records include terrain terms.
- GeoJSON API implemented.
- MapLibre interface implemented.
- Text-aware terrain enrichment baseline implemented.
- Category-terrain association at centroid resolution is statistically significant but modest.
- Current water-distance results expose proxy limitations.
- Nominatim workload is estimated locally without uncontrolled public API use.

Unsafe until additional experiments:

- 70% municipality-level geocoding achieved.
- Kappa cluster near rivers.
- Tengu cluster in mountains.
- Yokai distribution confirms terrain determinism.
- Yokai distribution confirms Yanagita's concentric diffusion theory.
- NER works accurately on folkloric Japanese.
- The interface has been validated with users.

## Required Rewrite from the Provided Proposal Text

The provided proposal text is a strong target vision, but the paper should be revised as follows unless the missing experiments are completed:

- Replace "largest systematic archive" with "large-scale archive" unless a citation supports the superlative.
- Replace "no tool currently provides this capability" with "few reproducible open-source tools expose this workflow end to end" unless a survey is provided.
- Replace "PostGIS" with "GeoPandas" for the current implementation, or actually add PostGIS.
- Replace "elevation, slope, land-cover composition" with "planned extensions" unless those layers are implemented.
- Replace "KDE surfaces show kappa..." with "the interface supports heatmap inspection; current centroid results should not be read as local ecological evidence."
- Remove "70%" unless the geocoding run and evaluation are completed.

## Next Implementation Priorities

1. Run GiNZA extraction over all records and report extraction coverage.
2. Add local/frozen geocoding workflow and evaluate a manual sample.
3. Add Japanese high-resolution hydrology and DEM.
4. Add `_geocode_confidence` and `_terrain_evidence`.
5. Add uncertainty controls to the map.
6. Add one case study each for Kappa, Tengu, and Kitsune.
7. Add source-bias controls and normalized density views.

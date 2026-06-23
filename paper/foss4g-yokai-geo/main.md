# An Open-Source Terrain-Aware Geographic Visualization Pipeline for the Nichibun Yokai Archive

## Abstract

Yokai folklore has often been interpreted through geography: water spirits are associated with rivers and irrigation networks, mountain beings with ridgelines and forests, and boundary spirits with passes, roads, and transitional spaces. Yet the largest systematic archive of yokai records, the International Research Center for Japanese Studies Kaii-Yokai Densho Database, is still primarily accessed as text and tables. This paper presents a fully open-source geospatial pipeline and web map that turns 33,378 cleaned Nichibun records into an interactive terrain-aware research instrument. The system assigns prefecture-level coordinates, extracts place mentions and terrain terms from Japanese summaries with GiNZA, refines place mentions through OpenStreetMap Nominatim, enriches records with open geospatial layers from GADM and Natural Earth using GeoPandas, and serves the result as GeoJSON to a MapLibre GL interface. In a first reproducible experiment using prefecture centroids, all 33,378 records were mapped and enriched with administrative and terrain context. The resulting dataset shows a statistically significant but small association between yokai category and terrain class, chi-square = 488.49, df = 55, p = 8.59e-71, Cramer's V = 0.054. These results should be read as an interface and pipeline validation rather than a final test of folklore geography. The contribution is a reproducible FOSS stack that makes terrain-based and diffusion-based hypotheses about yokai distribution inspectable, extensible, and ready for higher-resolution geocoding.

## 1. Introduction

Japanese yokai traditions are deeply spatial. In Yanagita Kunio's discussions of folklore distribution, supernatural beings and anomalous events are not only narrative motifs but also geographical phenomena. Water-related beings such as kappa are expected to cluster near rivers, ponds, and irrigation systems; mountain beings such as tengu or yama-no-kami are expected to appear in upland and forested settings; boundary beings are often narrated at passes, roads, bridges, and village edges. Yanagita's concentric diffusion theory, originally proposed for dialect distribution, further suggests that cultural forms may radiate from centers and persist in older forms at the periphery.

Testing these ideas at archive scale requires a way to see and manipulate spatial structure. The Nichibun Kaii-Yokai Densho Database is the largest systematic digital collection of Japanese yokai and uncanny folklore records. It contains tens of thousands of entries with names, regional metadata, source references, and short summaries. However, the archive is primarily designed for keyword lookup and table browsing. A researcher can find records by name or region, but cannot directly ask whether a class of records lies closer to water, whether mountain-associated categories are inland, or whether category distributions show center-periphery structure.

We present an open-source geospatial visualization system for the Nichibun yokai archive. The system transforms cleaned text records into enriched geospatial features and serves them through an interactive MapLibre GL map. It supports three views: individual points for close reading, heatmap density for concentration patterns, and terrain bands for comparison with coast and water proximity. The purpose is not to replace philological interpretation, but to create a reproducible exploratory layer where hypotheses about landscape, ecology, and diffusion can be inspected before being tested more formally.

## 2. Related Work and Motivation

Folklore geography has long treated narrative distribution as evidence for regional ecology, historical transmission, and local ritual practice. Yokai studies in particular frequently connect beings to landscape categories: rivers, mountains, fields, shorelines, roads, and settlement edges. Digital humanities work has made large cultural archives searchable, but search does not automatically make spatial structure visible. GIS methods can bridge this gap, but proprietary map stacks and manually geocoded datasets make reproduction difficult.

The system described here is designed for FOSS4G principles. Every major component is open source: Python, GiNZA, spaCy, GeoPandas, Shapely, PyProj, geopy, OpenStreetMap Nominatim, GADM, Natural Earth, Next.js, and MapLibre GL. The map uses OpenStreetMap raster tiles rather than proprietary basemaps. The pipeline is script-based and writes intermediate JSON files so that researchers can inspect, replace, or audit each stage.

## 3. Data

The input dataset is `data/nichibun/nichibun_cleaned.json`, containing 33,378 cleaned Nichibun records. Each record includes:

- `id`
- `name`
- `name_reading`
- `prefecture`
- `region`
- `major_category`
- `phenomenon`
- `summary`
- `embed_text`

The present experiments use all 33,378 records. Category counts are highly imbalanced: Other has 19,084 records, followed by Kitsune 3,618, Snake/Dragon 2,335, Yurei 1,641, Kappa 1,412, Tanuki 1,268, Tengu 1,224, Oni 807, Yama-no-kami 722, Inugami 552, Neko 466, and Hitodama 249.

## 4. System Pipeline

### 4.1 Prefecture Centroid Georeferencing

The first stage assigns a coordinate to every record using its structured `prefecture` field. The script `scripts/analysis/geocode_prefecture.py` defines all 47 Japanese prefectures in a built-in centroid dictionary and appends:

- `_lat`
- `_lng`
- `_geo_level: "prefecture"`

The output is `data/nichibun/nichibun_georef.json`. On the current cleaned dataset, all 33,378 records received coordinates and no records had missing prefecture values.

### 4.2 Place Mention and Terrain Term Extraction

The second stage, `scripts/analysis/extract_place_names.py`, reads `nichibun_georef.json` and applies GiNZA, an open-source Japanese NLP pipeline, to the `summary` field. It stores place entities as `_place_mentions` and rule-based topographic words as `_terrain_terms`. The rule-based terrain vocabulary includes words such as mountain, river, pass, coast, marsh, forest, rice paddy, bridge, road, cave, rock, and waterfall. The script uses `data/nichibun/ner_cache.json` so that long runs can be resumed without repeating completed records.

### 4.3 Nominatim Refinement

The third stage, `scripts/analysis/geocode_nominatim.py`, refines extracted place mentions with OpenStreetMap Nominatim through geopy. The user agent is `yokai-folklore-research`, requests are limited to one per second, results are cached in `data/nichibun/nominatim_cache.json`, and queries are constrained to Japan with `country_codes="jp"`. A prefecture consistency check rejects results whose returned prefecture differs from the record's original prefecture. Successful records are upgraded to:

- `_geo_level: "municipality"`
- refined `_lat`
- refined `_lng`
- `_geocoded_place`

Records that fail or are rejected keep the original prefecture centroid. Because Nominatim rate limits make full archive geocoding a long-running operation, the current paper reports the completed prefecture-resolution experiment and treats municipality refinement as an implemented but separately runnable stage.

### 4.4 Terrain Enrichment

The terrain enrichment script, `scripts/analysis/terrain_enrich.py`, downloads and caches:

- GADM v4.1 Japan level 2 administrative boundaries to `data/geo/gadm41_JPN_2.json`
- Natural Earth river centerlines to `data/geo/ne_rivers.geojson`
- Natural Earth lakes to `data/geo/ne_lakes.geojson`
- Natural Earth coastlines to `data/geo/ne_coastline.geojson`

It joins each point to a GADM level 2 municipality and computes nearest distances to combined river/lake features and coastline using an equal-distance projected CRS. Each record receives:

- `_dist_water_km`
- `_dist_coast_km`
- `_admin2`
- `_terrain_class`

The terrain classifier is intentionally simple and auditable. Records within 10 km of coast are labeled `coastal`; inland records more than 50 km from coast and within 2 km of water are labeled `valley`; records with mountain-related terms are labeled `mountain`; lake, pond, or marsh terms near water are labeled `inland_water`; remaining records are labeled `plain`. DEM support is documented but not downloaded automatically because national DEM mosaics are large and often require provider-specific handling.

### 4.5 GeoJSON API and Map Interface

The Next.js API route `src/app/api/yokai-geo/route.ts` lazily loads `data/nichibun/nichibun_enriched.json` into memory and serves a GeoJSON FeatureCollection. It supports filtering by:

- `category`
- `geo_level`
- `terrain_class`
- `limit`
- `include_summary`

The map interface at `/map` uses MapLibre GL with OpenStreetMap tiles. It supports three tabs:

- Points: individual records colored by major category, with popup summaries.
- Density: a MapLibre heatmap layer with zoom-dependent radius and blue-yellow-red color ramp.
- Terrain: Yanagita Terrain Bands, coloring records by coast and water proximity and terrain class.

For performance, if a filtered point set exceeds 5,000 records and the zoom is below 7, Points and Terrain views display a deterministic 10% sample. Density view keeps the full filtered set because heatmap aggregation is handled by MapLibre.

## 5. Experiments

### 5.1 Reproducible Setup

Experiments are implemented in `scripts/analysis/yokai_geo_experiments.py`. The script reads `data/nichibun/nichibun_enriched.json` and writes outputs to `analysis/yokai_geo/`:

- `experiment_summary.json`
- `category_terrain_table.csv`
- `category_distance_stats.csv`
- `category_kyoto_distance_stats.csv`
- `prefecture_record_counts.csv`
- `fig_category_terrain_proportions.png`
- `fig_category_median_coast_distance.png`
- `fig_category_median_kyoto_distance.png`
- `fig_records_by_terrain.png`

The current run used prefecture centroids for all records. This is sufficient to validate the system and to reveal coarse regional structure, but it cannot resolve local river, shrine, village, or pass-level relationships.

### 5.2 Terrain Distribution

The enrichment stage classified the 33,378 records as:

- coastal: 17,983
- plain: 14,207
- valley: 1,188

This distribution partly reflects the use of prefecture centroids. Coastal prefectural capitals can make records from large inland prefectures appear more coastal than they would under municipality-level geocoding. This is a useful diagnostic: it shows why the Nominatim refinement stage is necessary for strong terrain claims.

### 5.3 Category by Terrain

The category-terrain contingency table shows a statistically significant association:

- chi-square = 488.49
- degrees of freedom = 55
- p = 8.59e-71
- Cramer's V = 0.054

The p-value is small because the dataset is large, but the effect size is also small. Therefore the correct interpretation is that category and coarse terrain class are not independent in the current representation, but the magnitude of the association is modest at prefecture resolution.

Some category-level tendencies are nevertheless visible. Kappa records are 59.2% coastal under this centroid model, while Kitsune records are 40.1% coastal and 56.3% plain. Tengu records have the highest valley share among the common categories in this run, at 7.0%. These are exploratory signals rather than final ecological findings.

### 5.4 Distance to Coast and Water

Median distance to coast varies by category. In the current run:

- Kappa: 6.315 km
- Tanuki: 6.315 km
- Tengu: 8.098 km
- Yama-no-kami: 9.858 km
- Kitsune: 15.763 km

Median distance to water is less directly interpretable because the Natural Earth river/lake layers contain only major hydrological features, and prefecture centroids are coarse. For example, Kappa records have a median major-water distance of 219.0 km in this run, which contradicts the expected local river association and demonstrates the limitation of using coarse hydrology and prefectural centroids for water-spirit analysis.

### 5.5 Kyoto Distance as a Diffusion Proxy

The experiment script also computes great-circle distance from Kyoto, a rough proxy for center-periphery diffusion analysis. This is not a formal test of Yanagita's concentric diffusion theory, but it creates the data needed for future models: category-specific distance distributions can be compared with terrain distributions and source period metadata once higher-resolution geocoding is complete.

## 6. Discussion

The main finding is methodological. The system makes it possible to move from text-table search to spatial inspection with reproducible open-source tools. Even the coarse centroid experiment reveals category-terrain differences and highlights where stronger geocoding is necessary. The Kappa water-distance result is especially informative: the visualization pipeline exposes a mismatch between folklore expectation and current feature resolution. Rather than hiding this limitation, the system makes it visible and measurable.

For digital humanities researchers, this matters because archive-scale folklore analysis often depends on partial metadata. A robust system must preserve uncertainty and resolution level. The `_geo_level` field allows the interface and analysis scripts to distinguish prefecture-level records from municipality-level refinements. This prevents users from mistaking coarse coordinates for precise event locations.

For FOSS4G, the contribution is a complete geospatial stack that can be adapted to other cultural heritage archives. The same design can process records that have regional fields, short narrative summaries, and partial place names. Researchers can swap the NER model, add historical gazetteers, replace the terrain classifier, or connect a PostGIS backend without changing the basic data contract.

## 7. Limitations

The current reported experiment uses prefecture centroids. This is intentionally conservative: it validates the pipeline and interface, but it does not support fine-grained ecological claims. Municipality-level Nominatim refinement is implemented, but full execution over all unique place mentions is slow because Nominatim requires low request rates. A production research run should either use a local Nominatim instance, a curated historical gazetteer, or an institutional geocoding cache.

The terrain enrichment currently uses Natural Earth hydrology, which is appropriate for coarse geographic context but too sparse for irrigation canals, village streams, ponds, and small sacred water sites. These local features are central to many yokai traditions. Future work should integrate Japanese national hydrography, land-cover data, elevation, slope, and historical administrative boundaries.

NER on folkloric Japanese is also difficult. Summaries often contain ambiguous local names, obsolete place names, shrine names, and terrain descriptions without formal toponyms. The rule-based terrain term extraction is deliberately simple and should be replaced or augmented with validated annotation in future work.

## 8. Conclusion

This paper presented an open-source geographic visualization pipeline for the Nichibun yokai archive. The system georeferences records, extracts place and terrain cues, enriches points with administrative and terrain context, serves GeoJSON through a Next.js API, and renders interactive Points, Density, and Terrain views with MapLibre GL. On 33,378 records, the current prefecture-level run successfully produced a complete enriched dataset and a functioning web map. The first experiment found a statistically significant but small association between yokai category and coarse terrain class. More importantly, it demonstrated a reproducible path from folklore text records to inspectable geospatial evidence. The next research step is to complete higher-resolution geocoding through a local or cached Nominatim workflow and to test terrain and diffusion hypotheses with models that explicitly account for geocoding uncertainty.

## Reproducibility

Run the implemented pipeline:

```bash
python scripts/analysis/geocode_prefecture.py
python scripts/analysis/extract_place_names.py
python scripts/analysis/geocode_nominatim.py
python scripts/analysis/terrain_enrich.py
python scripts/analysis/yokai_geo_experiments.py
npm run build
npm run dev
```

The interactive map is available at:

```text
http://localhost:3000/map
```

The current reported experiment can be reproduced without Nominatim by running:

```bash
python scripts/analysis/geocode_prefecture.py
python scripts/analysis/terrain_enrich.py --input data/nichibun/nichibun_georef.json --output data/nichibun/nichibun_enriched.json
python scripts/analysis/yokai_geo_experiments.py
```
# Superseded Draft

The authoritative current paper is `main.tex` / `main.pdf`. This Markdown file is an earlier draft kept for reference and may not reflect the final prefecture-centroid guardrails, residual diagnostics, or FOSS dependency table.

# Change Log

## Claim and terminology

- Reframed the contribution as a resolution-aware evidence representation,
  not a discovery of physical terrain or ecological relationships.
- Defined the Folklore Geospatial Support Model as a representation schema,
  not a predictive model.
- Replaced confidence language with support basis and provenance.
- Removed exclusive terrain classes from the primary analysis.
- Removed the unsupported `admin2 or boundary interface = 9,693` aggregate.
- Replaced correction/error language with administrative-resolution
  sensitivity.
- Reserved Kappa–water and Yurei–death for construct-validity checks.

## Data and computation

- Recomputed all reported quantities in one canonical run.
- Corrected broad human–environment interface membership to require both an
  environmental channel and a human-condition channel.
- Verified `9,518 <= 16,066` globally and per record.
- Added municipality and prefecture support polygons and 128 deterministic
  area-uniform samples per support.
- Added polygon area, minimum and sampled distances, threshold proportions,
  river/coastline density, and lake-area share.
- Added the requested coast, river, and water threshold grids.
- Increased the association null to 10,000 prefecture-stratified
  permutations.
- Added observed/null prevalence, observed-to-expected ratios, prevalence
  differences, odds ratios, 95% intervals, empirical values, and
  Benjamini–Hochberg adjusted values.
- Increased dictionary-deletion robustness to 100 replicates per rate.
- Added category-name masking and a separate interface-definition ablation.

## Manuscript and figures

- Rewrote the title, abstract, introduction, research questions, related work,
  methods, results, discussion, limitations, ethics, reproducibility, and
  conclusion.
- Added a Crown Jewel figure showing record evidence, support polygons,
  display anchor, support basis, and ambiguity.
- Replaced the residual heatmap with an odds-ratio/95% interval plot.
- Regenerated four vector PDF figures and matching preview PNGs.
- Regenerated result-backed LaTeX macros and tables.
- Replaced unverified extraction evaluation language with rule-based coverage.
- Added a local qualitative trace table while withholding source excerpts
  from public redistribution pending author confirmation.

## Quality assurance

- Built the ISPRS manuscript as an eight-page PDF.
- Checked citation/BibTeX coverage, figure/table references and order,
  terminology, unsupported claims, broad-interface subset logic, and LaTeX
  overflow.
- Recorded the canonical input hashes, base Git commit, configuration,
  dictionary hash, package versions, random seeds, runtime, execution date,
  output hashes, and number-to-source map.

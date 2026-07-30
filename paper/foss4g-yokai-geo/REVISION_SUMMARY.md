# Revised Claim, Title, Abstract, and Research Questions

## One-sentence claim

This work represents vague folklore locations through separate evidence
channels for administrative support areas, candidate toponyms, non-toponymic
place descriptions, geographic context, human-condition terms, interface
evidence, and support provenance, and shows how geographic summaries change
when administrative support is refined without treating display anchors as
event locations.

## Title

From Point Anchors to Geospatial Support: A Resolution-Aware Representation of
Toponymic and Non-Toponymic Place Evidence in a Japanese Yokai Archive

## Abstract

Folklore archives often identify a broad administrative region while their
summaries mix named places with non-toponymic descriptions of rivers, roads,
dwellings, ritual sites, and boundaries. Treating an administrative
representative point as an event location can therefore make the mapped
evidence appear more precise than the source permits. We present a
resolution-aware representation for 33,378 records from the Database of
Folktales of Mysterious Phenomena and Yokai. It separates administrative
support areas, candidate toponyms, non-toponymic place descriptions,
geographic proximity, human-condition terms, derived interfaces, display
anchors, and provenance. Rule-based coverage is 28.0% for candidate toponyms
and 75.0% for place descriptions; these values are not extraction accuracy
because no human gold labels are available. Rule-constrained local matching
assigns municipality support to 1,231 records across 452 units. Relative to
prefecture support, municipality polygons reduce support area by a median
97.5% and change sampled median coastline distance by 9.2 km.
Prefecture-stratified language associations recover expected Kappa–water and
Yurei–death constructions, but these are construct checks rather than new
folkloristic findings. A separate Kappa distance diagnostic does not support
closer physical proximity to mapped major water. The contribution is an
inspectable, failure-aware baseline that distinguishes display anchors from
the support areas warranted by the archive.

## Research Questions

- **RQ1 — Representation:** What evidence channels can be derived from vague
  folklore records while preserving the geographic support warranted by each
  record?
- **RQ2 — Resolution sensitivity:** For records with uniquely matched
  municipality support, how do support area and coordinate-derived geographic
  features change relative to the prefecture-level baseline?
- **RQ3 — Archive-language association:** Which category–place-function
  associations remain after controlling for prefectural composition?

## Contribution paragraph

The contributions are (i) an evidence-channel representation that separates
textual and geographic support; (ii) an application to 33,378 archive records;
(iii) a rule-constrained municipality-support subset; (iv) polygon-based
resolution-sensitivity diagnostics; (v) prefecture-stratified archive-language
association analyses with corrected inference and robustness checks; and
(vi) an inspectable implementation whose reported numbers and figures are
generated from one canonical result.

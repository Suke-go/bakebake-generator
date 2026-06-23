# Geospatial Source Data

This directory is used by the yokai geography pipeline for open GIS inputs.

Only this README is tracked. Downloaded archives, extracted shapefiles, derived
GeoJSON/JSON layers, DEM files, and the full MLIT W05 river GeoJSON are
intentionally ignored by Git.

Regenerate local inputs with:

```bash
python scripts/analysis/terrain_enrich.py --force-download
```

Use `--hydrology-source naturalearth` for a lighter Natural Earth-only run, or
the default `--hydrology-source mlit` for the full MLIT W05 river context. The
Nichibun record datasets under `data/nichibun/` are also local generated data
and are not committed.

#!/usr/bin/env python3
"""Enrich geocoded Nichibun records with open-source terrain features."""

from __future__ import annotations

import argparse
import json
import math
import os
import zipfile
from collections import Counter
from pathlib import Path
from typing import Any

import requests


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_INPUT = ROOT / "data" / "nichibun" / "nichibun_georef_final.json"
DEFAULT_OUTPUT = ROOT / "data" / "nichibun" / "nichibun_enriched.json"
DEFAULT_GEO_DIR = ROOT / "data" / "geo"

GADM_LEVEL2_URL = "https://geodata.ucdavis.edu/gadm/gadm4.1/json/gadm41_JPN_2.json.zip"
NE_RIVERS_URL = "https://naturalearth.s3.amazonaws.com/10m_physical/ne_10m_rivers_lake_centerlines.zip"
NE_LAKES_URL = "https://naturalearth.s3.amazonaws.com/10m_physical/ne_10m_lakes.zip"
NE_COASTLINE_URL = "https://naturalearth.s3.amazonaws.com/10m_physical/ne_10m_coastline.zip"

JAPAN_BOUNDS = (122.0, 20.0, 154.5, 46.5)
JAPAN_DISTANCE_CRS = "EPSG:3095"
MLIT_W05_YEAR_BY_PREF_CODE = {
    1: 9,
    **{code: 7 for code in range(2, 8)},
    **{code: 8 for code in range(8, 15)},
    **{code: 7 for code in range(15, 19)},
    **{code: 8 for code in range(19, 25)},
    **{code: 9 for code in range(25, 31)},
    **{code: 8 for code in range(31, 36)},
    **{code: 6 for code in range(36, 40)},
    **{code: 7 for code in range(40, 48)},
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Attach terrain features to geocoded Nichibun records.")
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--geo-dir", type=Path, default=DEFAULT_GEO_DIR)
    parser.add_argument("--force-download", action="store_true")
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument(
        "--hydrology-source",
        choices=["mlit", "naturalearth"],
        default="mlit",
        help="River source for water-distance and prefecture river-density features.",
    )
    parser.add_argument(
        "--mlit-pref-codes",
        default="all",
        help="Comma/range list of W05 prefecture codes to download, e.g. all or 13,14 or 1-47.",
    )
    return parser.parse_args()


def require_geo_dependencies() -> tuple[Any, Any, Any]:
    try:
        import geopandas as gpd
        import pandas as pd
        from shapely.geometry import Point
    except ModuleNotFoundError as exc:
        raise ModuleNotFoundError(
            "geopandas, shapely, pyproj, and pandas are required. "
            "Install with: pip install -r scripts/analysis/requirements.txt"
        ) from exc
    return gpd, pd, Point


def load_records(path: Path) -> list[dict[str, Any]]:
    with path.open("r", encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, list):
        raise ValueError(f"Expected list JSON at {path}")
    return [row for row in data if isinstance(row, dict)]


def atomic_write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f"{path.name}.tmp")
    with tmp.open("w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    os.replace(tmp, path)


def download(url: str, path: Path, force: bool) -> Path:
    if path.exists() and not force:
        return path
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f"{path.name}.part")
    with requests.get(url, stream=True, timeout=180) as response:
        response.raise_for_status()
        with tmp.open("wb") as f:
            for chunk in response.iter_content(chunk_size=1024 * 1024):
                if chunk:
                    f.write(chunk)
    tmp.replace(path)
    return path


def parse_pref_codes(value: str) -> list[int]:
    if value.strip().lower() == "all":
        return list(range(1, 48))
    codes: set[int] = set()
    for raw_token in value.split(","):
        token = raw_token.strip()
        if not token:
            continue
        if "-" in token:
            start_text, end_text = token.split("-", 1)
            start = int(start_text)
            end = int(end_text)
            codes.update(range(min(start, end), max(start, end) + 1))
        else:
            codes.add(int(token))
    invalid = sorted(code for code in codes if code < 1 or code > 47)
    if invalid:
        raise ValueError(f"Invalid prefecture codes: {invalid}")
    return sorted(codes)


def mlit_w05_url(pref_code: int) -> str:
    year = MLIT_W05_YEAR_BY_PREF_CODE[pref_code]
    return (
        "https://nlftp.mlit.go.jp/ksj/gml/data/W05/"
        f"W05-{year:02d}/W05-{year:02d}_{pref_code:02d}_GML.zip"
    )


def prepare_mlit_w05_rivers(gpd: Any, pd: Any, geo_dir: Path, force: bool, pref_codes: list[int]) -> Path:
    out_path = geo_dir / "mlit_w05_rivers.geojson"
    metadata_path = geo_dir / "mlit_w05_rivers_metadata.json"
    if out_path.exists() and metadata_path.exists() and not force:
        return out_path

    frames = []
    source_rows: list[dict[str, Any]] = []
    work_dir = geo_dir / "mlit_w05"
    for pref_code in pref_codes:
        year = MLIT_W05_YEAR_BY_PREF_CODE[pref_code]
        url = mlit_w05_url(pref_code)
        zip_path = download(url, work_dir / f"W05-{year:02d}_{pref_code:02d}_GML.zip", force)
        extract_dir = work_dir / f"W05-{year:02d}_{pref_code:02d}_GML"
        stream_candidates = list(extract_dir.rglob("*Stream.shp")) if extract_dir.exists() else []
        if force or not stream_candidates:
            extract_dir.mkdir(parents=True, exist_ok=True)
            with zipfile.ZipFile(zip_path) as archive:
                archive.extractall(extract_dir)
            stream_candidates = list(extract_dir.rglob("*Stream.shp"))
        if not stream_candidates:
            raise FileNotFoundError(f"No Stream shapefile extracted from {zip_path}")

        stream_path = stream_candidates[0]
        try:
            river = gpd.read_file(stream_path, on_invalid="ignore")
        except TypeError:
            river = gpd.read_file(stream_path)
        if river.crs is None:
            river = river.set_crs("EPSG:4612", allow_override=True)
        river = river.to_crs("EPSG:4326")
        river = river[river.geometry.notna()].copy()
        river = river[river.geometry.geom_type.isin(["LineString", "MultiLineString"])].copy()
        keep_cols = [col for col in ["W05_001", "W05_002", "W05_003", "W05_004"] if col in river.columns]
        river = river[keep_cols + ["geometry"]].copy()
        river["pref_code"] = f"{pref_code:02d}"
        river["source_year"] = 2000 + year
        frames.append(river)
        source_rows.append(
            {
                "pref_code": f"{pref_code:02d}",
                "source_year": 2000 + year,
                "url": url,
                "zip_size_bytes": zip_path.stat().st_size,
                "features": int(len(river)),
            }
        )

    if not frames:
        raise ValueError("No MLIT W05 river features were loaded.")

    merged = gpd.GeoDataFrame(pd.concat(frames, ignore_index=True), geometry="geometry", crs="EPSG:4326")
    merged.to_file(out_path, driver="GeoJSON")
    atomic_write_json(
        metadata_path,
        {
            "source": "MLIT National Land Numerical Information W05 river data",
            "feature_count": int(len(merged)),
            "prefecture_count": len(pref_codes),
            "prefectures": source_rows,
        },
    )
    return out_path


def extract_first(zip_path: Path, suffix: str, out_path: Path, force: bool) -> Path:
    if out_path.exists() and not force:
        return out_path
    with zipfile.ZipFile(zip_path) as archive:
        candidates = [name for name in archive.namelist() if name.lower().endswith(suffix)]
        if not candidates:
            raise FileNotFoundError(f"No {suffix} file in {zip_path}")
        out_path.parent.mkdir(parents=True, exist_ok=True)
        with archive.open(candidates[0]) as src, out_path.open("wb") as dst:
            dst.write(src.read())
    return out_path


def convert_shapefile_zip_to_geojson(gpd: Any, zip_url: str, geo_dir: Path, stem: str, out_name: str, force: bool) -> Path:
    out_path = geo_dir / out_name
    if out_path.exists() and not force:
        return out_path
    zip_path = download(zip_url, geo_dir / f"{stem}.zip", force)
    extract_dir = geo_dir / stem
    shp_path = extract_dir / f"{stem}.shp"
    if force or not shp_path.exists():
        extract_dir.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(zip_path) as archive:
            archive.extractall(extract_dir)
        shp_candidates = list(extract_dir.glob("*.shp"))
        if not shp_candidates:
            raise FileNotFoundError(f"No shapefile extracted from {zip_path}")
        shp_path = shp_candidates[0]
    gdf = gpd.read_file(shp_path)
    gdf = gdf.cx[JAPAN_BOUNDS[0] : JAPAN_BOUNDS[2], JAPAN_BOUNDS[1] : JAPAN_BOUNDS[3]].copy()
    gdf.to_file(out_path, driver="GeoJSON")
    return out_path


def prepare_geo_data(
    gpd: Any,
    pd: Any,
    geo_dir: Path,
    force: bool,
    hydrology_source: str,
    mlit_pref_codes: list[int],
) -> dict[str, Any]:
    geo_dir.mkdir(parents=True, exist_ok=True)
    gadm_zip = download(GADM_LEVEL2_URL, geo_dir / "gadm41_JPN_2.json.zip", force)
    gadm = extract_first(gadm_zip, ".json", geo_dir / "gadm41_JPN_2.json", force)
    if hydrology_source == "mlit":
        rivers = prepare_mlit_w05_rivers(gpd, pd, geo_dir, force, mlit_pref_codes)
        river_source = "mlit_w05"
    else:
        rivers = convert_shapefile_zip_to_geojson(
            gpd,
            NE_RIVERS_URL,
            geo_dir,
            "ne_10m_rivers_lake_centerlines",
            "ne_rivers.geojson",
            force,
        )
        river_source = "natural_earth_10m"
    lakes = convert_shapefile_zip_to_geojson(
        gpd,
        NE_LAKES_URL,
        geo_dir,
        "ne_10m_lakes",
        "ne_lakes.geojson",
        force,
    )
    coastline = convert_shapefile_zip_to_geojson(
        gpd,
        NE_COASTLINE_URL,
        geo_dir,
        "ne_10m_coastline",
        "ne_coastline.geojson",
        force,
    )
    dem_path = geo_dir / "japan_dem.tif"
    if not dem_path.exists():
        (geo_dir / "japan_dem.README.txt").write_text(
            "DEM download is intentionally skipped. For elevation features, download "
            "SRTM 30m via OpenTopography or JAXA ALOS AW3D30 tiles covering Japan, "
            "mosaic them to japan_dem.tif, and sample points in a future extension.\n",
            encoding="utf-8",
        )
    return {
        "gadm": gadm,
        "rivers": rivers,
        "lakes": lakes,
        "coastline": coastline,
        "river_source": river_source,
        "lake_source": "natural_earth_10m",
        "coastline_source": "natural_earth_10m",
    }


def parse_float(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def build_points(gpd: Any, Point: Any, records: list[dict[str, Any]]) -> Any:
    rows = []
    for index, record in enumerate(records):
        lat = parse_float(record.get("_lat"))
        lng = parse_float(record.get("_lng"))
        rows.append(
            {
                "_row_index": index,
                "id": str(record.get("id") or index),
                "geometry": Point(lng, lat) if lat is not None and lng is not None else None,
            }
        )
    return gpd.GeoDataFrame(rows, geometry="geometry", crs="EPSG:4326")


def nearest_distance_km(gpd: Any, pd: Any, points: Any, features: Any) -> Any:
    out = pd.Series([None] * len(points), index=points.index, dtype="object")
    valid = points[points.geometry.notna()][["_row_index", "geometry"]].copy()
    if valid.empty or features.empty:
        return out
    valid["_point_key"] = valid.geometry.apply(lambda geom: f"{geom.x:.7f},{geom.y:.7f}")
    unique = valid.drop_duplicates("_point_key").copy()
    left = unique.to_crs(JAPAN_DISTANCE_CRS)
    right = features[["geometry"]].to_crs(JAPAN_DISTANCE_CRS)
    nearest = gpd.sjoin_nearest(left, right, how="left", distance_col="_distance_m")
    distances = nearest.groupby("_point_key")["_distance_m"].min() / 1000.0
    distance_by_key = {key: round(float(value), 3) for key, value in distances.items()}
    out.loc[valid.index] = valid["_point_key"].map(distance_by_key)
    return out


def line_length_within_km(features: Any, polygon: Any) -> float:
    if features.empty:
        return 0.0
    try:
        candidates = features.iloc[list(features.sindex.query(polygon, predicate="intersects"))]
    except Exception:
        candidates = features[features.intersects(polygon)]
    if candidates.empty:
        return 0.0
    length_m = 0.0
    for geometry in candidates.geometry:
        if geometry is None or geometry.is_empty:
            continue
        clipped = geometry.intersection(polygon)
        if not clipped.is_empty:
            length_m += float(clipped.length)
    return round(length_m / 1000.0, 3)


def polygon_area_within_km2(features: Any, polygon: Any) -> float:
    if features.empty:
        return 0.0
    try:
        candidates = features.iloc[list(features.sindex.query(polygon, predicate="intersects"))]
    except Exception:
        candidates = features[features.intersects(polygon)]
    if candidates.empty:
        return 0.0
    area_m2 = 0.0
    for geometry in candidates.geometry:
        if geometry is None or geometry.is_empty:
            continue
        clipped = geometry.intersection(polygon)
        if not clipped.is_empty:
            area_m2 += float(clipped.area)
    return round(area_m2 / 1_000_000.0, 3)


def build_prefecture_name_lookup(gpd: Any, Point: Any, records: list[dict[str, Any]], admin1: Any) -> dict[str, str]:
    seen: dict[str, tuple[float, float]] = {}
    for record in records:
        pref = str(record.get("prefecture") or "").strip()
        lat = parse_float(record.get("_lat"))
        lng = parse_float(record.get("_lng"))
        if pref and lat is not None and lng is not None and pref not in seen:
            seen[pref] = (lng, lat)
    rows = [{"prefecture": pref, "geometry": Point(lng, lat)} for pref, (lng, lat) in seen.items()]
    if not rows:
        return {}
    pref_points = gpd.GeoDataFrame(rows, geometry="geometry", crs="EPSG:4326")
    joined = gpd.sjoin(
        pref_points,
        admin1[["NAME_1", "geometry"]],
        how="left",
        predicate="within",
    ).drop(columns=["index_right"], errors="ignore")
    lookup = {}
    for row in joined.to_dict(orient="records"):
        pref = str(row.get("prefecture") or "").strip()
        name = row.get("NAME_1")
        if pref and name:
            lookup[pref] = str(name)
    return lookup


def build_prefecture_context(gpd: Any, Point: Any, records: list[dict[str, Any]], admin2: Any, rivers: Any, lakes: Any, coastline: Any) -> tuple[dict[str, dict[str, Any]], dict[str, str]]:
    admin1 = admin2[["NAME_1", "geometry"]].dissolve(by="NAME_1", as_index=False).to_crs("EPSG:4326")
    pref_lookup = build_prefecture_name_lookup(gpd, Point, records, admin1)
    admin1_proj = admin1.to_crs(JAPAN_DISTANCE_CRS)
    rivers_proj = rivers[["geometry"]].to_crs(JAPAN_DISTANCE_CRS)
    lakes_proj = lakes[["geometry"]].to_crs(JAPAN_DISTANCE_CRS)
    coastline_proj = coastline[["geometry"]].to_crs(JAPAN_DISTANCE_CRS)

    context_by_name: dict[str, dict[str, Any]] = {}
    for row in admin1_proj.to_dict(orient="records"):
        name = str(row["NAME_1"])
        geom = row["geometry"]
        area_km2 = round(float(geom.area) / 1_000_000.0, 3)
        coast_km = line_length_within_km(coastline_proj, geom)
        river_km = line_length_within_km(rivers_proj, geom)
        lake_area_km2 = polygon_area_within_km2(lakes_proj, geom)
        context_by_name[name] = {
            "_pref_gadm_name": name,
            "_pref_area_km2": area_km2,
            "_pref_coastline_km": coast_km,
            "_pref_coastline_km_per_1000km2": round(coast_km / area_km2 * 1000.0, 4) if area_km2 else None,
            "_pref_river_km": river_km,
            "_pref_river_km_per_1000km2": round(river_km / area_km2 * 1000.0, 4) if area_km2 else None,
            "_pref_lake_area_km2": lake_area_km2,
            "_pref_lake_area_pct": round(lake_area_km2 / area_km2 * 100.0, 4) if area_km2 else None,
        }
    return context_by_name, pref_lookup


def admin2_context_key(row: dict[str, Any]) -> str:
    return "\t".join(
        str(row.get(key) or "")
        for key in ["NAME_1", "NAME_2", "NL_NAME_2", "TYPE_2"]
    )


def build_target_admin2_keys(records: list[dict[str, Any]], admin_lookup: dict[int, dict[str, Any]]) -> set[str]:
    keys: set[str] = set()
    for index, record in enumerate(records):
        if str(record.get("_geo_level") or "") != "municipality":
            continue
        admin = admin_lookup.get(index)
        if admin:
            key = admin2_context_key(admin)
            if key.strip():
                keys.add(key)
    return keys


def build_admin2_context(admin2: Any, rivers: Any, lakes: Any, coastline: Any, target_keys: set[str]) -> dict[str, dict[str, Any]]:
    if not target_keys:
        return {}

    admin2_source = admin2.copy()
    admin2_source["_admin2_context_key"] = admin2_source.apply(
        lambda row: admin2_context_key(row.to_dict()),
        axis=1,
    )
    admin2_source = admin2_source[admin2_source["_admin2_context_key"].isin(target_keys)].copy()
    if admin2_source.empty:
        return {}

    admin2_proj = admin2_source.to_crs(JAPAN_DISTANCE_CRS)
    rivers_proj = rivers[["geometry"]].to_crs(JAPAN_DISTANCE_CRS)
    lakes_proj = lakes[["geometry"]].to_crs(JAPAN_DISTANCE_CRS)
    coastline_proj = coastline[["geometry"]].to_crs(JAPAN_DISTANCE_CRS)

    context: dict[str, dict[str, Any]] = {}
    for row in admin2_proj.to_dict(orient="records"):
        key = str(row["_admin2_context_key"])
        geom = row["geometry"]
        area_km2 = round(float(geom.area) / 1_000_000.0, 3)
        coast_km = line_length_within_km(coastline_proj, geom)
        river_km = line_length_within_km(rivers_proj, geom)
        lake_area_km2 = polygon_area_within_km2(lakes_proj, geom)
        context[key] = {
            "_admin2_context_name": row.get("NL_NAME_2") or row.get("NAME_2"),
            "_admin2_context_name_en": row.get("NAME_2"),
            "_admin2_context_type": row.get("TYPE_2"),
            "_admin2_area_km2": area_km2,
            "_admin2_coastline_km": coast_km,
            "_admin2_coastline_km_per_1000km2": round(coast_km / area_km2 * 1000.0, 4) if area_km2 else None,
            "_admin2_river_km": river_km,
            "_admin2_river_km_per_1000km2": round(river_km / area_km2 * 1000.0, 4) if area_km2 else None,
            "_admin2_lake_area_km2": lake_area_km2,
            "_admin2_lake_area_pct": round(lake_area_km2 / area_km2 * 100.0, 4) if area_km2 else None,
        }
    return context


def classify_terrain(record: dict[str, Any], dist_water: float | None, dist_coast: float | None) -> str:
    terms = {str(term) for term in record.get("_terrain_terms", [])}
    if dist_water is not None and dist_water < 0.5 and terms.intersection({"池", "湖", "沼"}):
        return "inland_water"
    if dist_coast is not None and dist_coast < 10:
        return "coastal"
    if dist_coast is not None and dist_coast > 50 and dist_water is not None and dist_water < 2:
        return "valley"
    if terms.intersection({"山", "峠", "森", "林", "谷", "滝"}) and (dist_coast is None or dist_coast >= 10):
        return "mountain"
    return "plain"


def classify_terrain_coordinate_only(dist_water: float | None, dist_coast: float | None) -> str:
    """Classify terrain from coordinates and GIS layers only.

    This intentionally excludes summary-derived terrain terms. In the current
    prefecture-centroid baseline, the output is therefore a diagnostic of the
    coordinate representation rather than a claim about narrative settings.
    """
    if dist_coast is not None and dist_coast < 10:
        return "coastal"
    if dist_coast is not None and dist_coast > 50 and dist_water is not None and dist_water < 2:
        return "valley"
    if dist_water is not None and dist_water < 0.5:
        return "inland_water"
    return "plain"


def classify_terrain_text_aware(record: dict[str, Any], dist_water: float | None, dist_coast: float | None) -> str:
    """Classify terrain after adding narrative terrain cues from summaries."""
    terms = {str(term) for term in record.get("_terrain_terms", [])}
    term_categories = {str(term) for term in record.get("_terrain_term_categories", [])}
    water_terms = {
        "\u6c60",
        "\u6cbc",
        "\u6e56",
        "\u6edd",
        "\u4e95\u6238",
        "\u7528\u6c34",
        "\u6c34\u8def",
    }
    mountain_terms = {
        "\u5c71",
        "\u5ce0",
        "\u8c37",
        "\u5d16",
        "\u68ee",
        "\u6797",
        "\u5ca9",
        "\u5ca9\u5c4b",
        "\u6d1e",
        "\u6d1e\u7a9f",
    }
    coast_terms = {
        "\u6d77",
        "\u6d77\u5cb8",
        "\u6d5c",
        "\u6d66",
        "\u5cf6",
        "\u5cac",
    }
    coord_class = classify_terrain_coordinate_only(dist_water, dist_coast)
    if "mountain" in term_categories or terms.intersection(mountain_terms):
        return "mountain"
    if "water" in term_categories or terms.intersection(water_terms):
        if coord_class != "coastal":
            return "inland_water"
    if "coast" in term_categories or terms.intersection(coast_terms):
        return "coastal"
    return coord_class


def nullable(value: Any) -> Any:
    try:
        if value is None or (hasattr(value, "isna") and value.isna()):
            return None
    except Exception:
        pass
    if isinstance(value, float) and math.isnan(value):
        return None
    return value


def main() -> None:
    args = parse_args()
    gpd, pd, Point = require_geo_dependencies()
    records = load_records(args.input)
    if args.limit > 0:
        records = records[: args.limit]
    mlit_pref_codes = parse_pref_codes(args.mlit_pref_codes)
    paths = prepare_geo_data(
        gpd,
        pd,
        args.geo_dir,
        args.force_download,
        args.hydrology_source,
        mlit_pref_codes,
    )

    points = build_points(gpd, Point, records)
    admin2 = gpd.read_file(paths["gadm"]).to_crs("EPSG:4326")
    admin_cols = [col for col in ["NAME_1", "NL_NAME_1", "NAME_2", "NL_NAME_2", "TYPE_2"] if col in admin2.columns]
    joined = gpd.sjoin(
        points[points.geometry.notna()],
        admin2[admin_cols + ["geometry"]],
        how="left",
        predicate="within",
    ).drop(columns=["index_right"], errors="ignore")
    admin_lookup = joined.set_index("_row_index").to_dict(orient="index")

    rivers = gpd.read_file(paths["rivers"]).to_crs("EPSG:4326")
    lakes = gpd.read_file(paths["lakes"]).to_crs("EPSG:4326")
    coastline = gpd.read_file(paths["coastline"]).to_crs("EPSG:4326")
    pref_context_by_name, pref_name_lookup = build_prefecture_context(
        gpd, Point, records, admin2, rivers, lakes, coastline
    )
    target_admin2_keys = build_target_admin2_keys(records, admin_lookup)
    admin2_context_by_key = build_admin2_context(admin2, rivers, lakes, coastline, target_admin2_keys)
    water = pd.concat([rivers[["geometry"]], lakes[["geometry"]]], ignore_index=True)
    water = gpd.GeoDataFrame(water, geometry="geometry", crs="EPSG:4326")

    points["_dist_water_km"] = nearest_distance_km(gpd, pd, points, water)
    points["_dist_coast_km"] = nearest_distance_km(gpd, pd, points, coastline)

    output: list[dict[str, Any]] = []
    coord_terrain_counts: Counter[str] = Counter()
    text_terrain_counts: Counter[str] = Counter()
    changed_terrain = 0
    admin2_hits = 0
    admin2_context_hits = 0
    for index, record in enumerate(records):
        row = dict(record)
        point_row = points.loc[points["_row_index"] == index].iloc[0]
        admin = admin_lookup.get(index, {})
        dist_water = nullable(point_row.get("_dist_water_km"))
        dist_coast = nullable(point_row.get("_dist_coast_km"))
        admin2_name = nullable(admin.get("NL_NAME_2") or admin.get("NAME_2"))
        pref_name = pref_name_lookup.get(str(row.get("prefecture") or "").strip())
        pref_context = pref_context_by_name.get(pref_name or "", {})
        coord_terrain = classify_terrain_coordinate_only(dist_water, dist_coast)
        text_terrain = classify_terrain_text_aware(row, dist_water, dist_coast)
        row["_dist_water_km"] = dist_water
        row["_dist_coast_km"] = dist_coast
        row["_admin2"] = admin2_name
        row["_terrain_coord_only"] = coord_terrain
        row["_terrain_text_aware"] = text_terrain
        row["_terrain_class"] = text_terrain
        row["_terrain_class_basis"] = "text_aware" if text_terrain != coord_terrain else "coordinate_only"
        row["_river_source"] = paths["river_source"]
        row["_lake_source"] = paths["lake_source"]
        row["_coastline_source"] = paths["coastline_source"]
        row.update(pref_context)
        if str(row.get("_geo_level") or "") == "municipality":
            admin2_context = admin2_context_by_key.get(admin2_context_key(admin), {})
            row.update(admin2_context)
            if admin2_context:
                admin2_context_hits += 1
        if admin2_name:
            admin2_hits += 1
        coord_terrain_counts[coord_terrain] += 1
        text_terrain_counts[text_terrain] += 1
        if text_terrain != coord_terrain:
            changed_terrain += 1
        output.append(row)

    atomic_write_json(args.output, output)

    print("=== Terrain enrichment report ===")
    print(f"Input records: {len(records):,}")
    print(f"Admin2 matched: {admin2_hits:,} ({admin2_hits / (len(records) or 1):.1%})")
    print(f"Prefecture polygon contexts: {len(pref_context_by_name):,} GADM prefectures")
    print(f"Prefecture names mapped from records: {len(pref_name_lookup):,}")
    print(f"Admin2 polygon contexts: {len(admin2_context_by_key):,} targeted GADM admin2 units")
    print(f"Admin2 polygon context attached: {admin2_context_hits:,}")
    print(f"River source: {paths['river_source']} ({len(rivers):,} features)")
    print(f"Lake source: {paths['lake_source']} ({len(lakes):,} features)")
    print(f"Coastline source: {paths['coastline_source']} ({len(coastline):,} features)")
    print("Coordinate-only terrain class counts:")
    for terrain, count in coord_terrain_counts.most_common():
        print(f"  {terrain}: {count:,}")
    print("Text-aware terrain class counts:")
    for terrain, count in text_terrain_counts.most_common():
        print(f"  {terrain}: {count:,}")
    print(f"Text-aware changed terrain labels: {changed_terrain:,} ({changed_terrain / (len(records) or 1):.1%})")
    print("Geo data files:")
    for name, path in paths.items():
        if isinstance(path, Path):
            print(f"  {name}: {path}")
        else:
            print(f"  {name}: {path}")
    print(f"Saved: {args.output}")


if __name__ == "__main__":
    main()

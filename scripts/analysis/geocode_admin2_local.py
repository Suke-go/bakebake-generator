#!/usr/bin/env python3
"""Refine Nichibun coordinates with local GADM admin2 name matching.

This stage is intentionally conservative. It only upgrades a record when a
municipality name can be matched uniquely inside the record's prefecture using
local open GIS data, avoiding public geocoding APIs for the first refinement.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import re
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_INPUT = ROOT / "data" / "nichibun" / "nichibun_ner.json"
DEFAULT_GADM = ROOT / "data" / "geo" / "gadm41_JPN_2.json"
DEFAULT_OUTPUT = ROOT / "data" / "nichibun" / "nichibun_georef_final.json"
DEFAULT_REPORT = ROOT / "analysis" / "yokai_geo" / "admin2_local_geocoding_report.json"

ALLOWED_ADMIN2_TYPES = {"Shi", "Machi", "Mura", "SpecialWard", "Capital", "Son"}
MUNICIPALITY_SUFFIXES = ("市", "区", "町", "村")
JAPANESE_CHAR_RE = re.compile(r"[\u3040-\u30ff\u3400-\u9fff々〆ヶーA-Za-z0-9]")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Refine records with local GADM admin2 gazetteer matching.")
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--gadm", type=Path, default=DEFAULT_GADM)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument(
        "--allow-ner-bare",
        action="store_true",
        help="Allow suffix-stripped admin2 names when matching extracted place mentions.",
    )
    return parser.parse_args()


def require_geo_dependencies() -> tuple[Any, Any]:
    try:
        import geopandas as gpd
        import pandas as pd
    except ModuleNotFoundError as exc:
        raise ModuleNotFoundError(
            "geopandas, shapely, pyproj, and pandas are required. "
            "Install with: pip install -r scripts/analysis/requirements.txt"
        ) from exc
    return gpd, pd


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


def normalize_spaces(value: Any) -> str:
    return re.sub(r"[\s　]+", "", str(value or "").strip())


def strip_municipality_suffix(value: Any) -> str:
    text = normalize_spaces(value)
    for suffix in MUNICIPALITY_SUFFIXES:
        if len(text) > 2 and text.endswith(suffix):
            return text[: -len(suffix)]
    return text


def has_left_boundary(text: str, start: int) -> bool:
    if start <= 0:
        return True
    return JAPANESE_CHAR_RE.match(text[start - 1]) is None


def contains_official_name(text: str, name: str) -> bool:
    start = text.find(name)
    while start >= 0:
        if has_left_boundary(text, start):
            return True
        start = text.find(name, start + 1)
    return False


def representative_lng_lat(gdf: Any) -> Any:
    projected = gdf.to_crs("EPSG:3095")
    points = projected.geometry.representative_point()
    point_gdf = gdf.copy()
    point_gdf["geometry"] = points
    point_gdf = point_gdf.set_geometry("geometry").set_crs("EPSG:3095", allow_override=True).to_crs("EPSG:4326")
    return point_gdf


def build_admin2(gpd: Any, gadm_path: Path) -> list[dict[str, Any]]:
    gdf = gpd.read_file(gadm_path).to_crs("EPSG:4326")
    gdf = gdf[gdf["TYPE_2"].isin(ALLOWED_ADMIN2_TYPES)].copy()
    points = representative_lng_lat(gdf)

    rows: list[dict[str, Any]] = []
    for idx, row in gdf.reset_index(drop=True).iterrows():
        point = points.iloc[idx].geometry
        nl_name = normalize_spaces(row.get("NL_NAME_2"))
        if not nl_name or nl_name == "NA":
            continue
        rows.append(
            {
                "prefecture": normalize_spaces(row.get("NL_NAME_1")),
                "gadm_name_1": row.get("NAME_1"),
                "admin2": nl_name,
                "admin2_en": row.get("NAME_2"),
                "admin2_type": row.get("TYPE_2"),
                "lng": round(float(point.x), 6),
                "lat": round(float(point.y), 6),
            }
        )
    return rows


def build_indexes(admin2_rows: list[dict[str, Any]], allow_ner_bare: bool) -> tuple[dict[str, list[dict[str, Any]]], dict[str, list[dict[str, Any]]]]:
    official: dict[str, list[dict[str, Any]]] = defaultdict(list)
    ner: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in admin2_rows:
        pref = str(row["prefecture"])
        name = str(row["admin2"])
        official[f"{pref}\t{name}"].append(row)
        ner[f"{pref}\t{name}"].append(row)
        if allow_ner_bare:
            bare = strip_municipality_suffix(name)
            if len(bare) >= 2 and bare != name:
                ner[f"{pref}\t{bare}"].append(row)
    return official, ner


def dedupe_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[tuple[str, str, str]] = set()
    out: list[dict[str, Any]] = []
    for row in rows:
        key = (str(row["prefecture"]), str(row["admin2"]), str(row["admin2_en"]))
        if key not in seen:
            seen.add(key)
            out.append(row)
    return out


def match_summary(record: dict[str, Any], by_pref: dict[str, list[dict[str, Any]]]) -> tuple[dict[str, Any] | None, list[str]]:
    pref = normalize_spaces(record.get("prefecture"))
    text = normalize_spaces(record.get("summary"))
    if not pref or not text:
        return None, []
    candidates: list[dict[str, Any]] = []
    matched_names: list[str] = []
    for row in by_pref.get(pref, []):
        name = str(row["admin2"])
        if contains_official_name(text, name):
            candidates.append(row)
            matched_names.append(name)
    candidates = dedupe_rows(candidates)
    if len(candidates) == 1:
        return candidates[0], matched_names
    return None, sorted(set(matched_names))


def match_ner(record: dict[str, Any], ner_index: dict[str, list[dict[str, Any]]]) -> tuple[dict[str, Any] | None, list[str]]:
    pref = normalize_spaces(record.get("prefecture"))
    matched_names: list[str] = []
    candidates: list[dict[str, Any]] = []
    for place in record.get("_place_mentions", []) or []:
        mention = normalize_spaces(place)
        if not mention:
            continue
        for key in {f"{pref}\t{mention}", f"{pref}\t{strip_municipality_suffix(mention)}"}:
            rows = ner_index.get(key, [])
            if rows:
                candidates.extend(rows)
                matched_names.append(mention)
    candidates = dedupe_rows(candidates)
    if len(candidates) == 1:
        return candidates[0], matched_names
    return None, sorted(set(matched_names))


def is_finite_number(value: Any) -> bool:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return False
    return math.isfinite(number)


def apply_match(record: dict[str, Any], hit: dict[str, Any], matched_names: list[str], method: str) -> dict[str, Any]:
    row = dict(record)
    row["_lat"] = hit["lat"]
    row["_lng"] = hit["lng"]
    row["_geo_level"] = "municipality"
    row["_geocoded_place"] = hit["admin2"]
    row["_geocode_method"] = method
    row["_geocode_source"] = "gadm41_jpn_2_local"
    row["_admin2_geocoded"] = hit["admin2"]
    row["_admin2_geocoded_en"] = hit["admin2_en"]
    row["_admin2_type"] = hit["admin2_type"]
    row["_admin2_match_terms"] = matched_names
    return row


def main() -> None:
    args = parse_args()
    gpd, _pd = require_geo_dependencies()
    records = load_records(args.input)
    if args.limit > 0:
        records = records[: args.limit]

    admin2_rows = build_admin2(gpd, args.gadm)
    official_index, ner_index = build_indexes(admin2_rows, args.allow_ner_bare)
    by_pref: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in admin2_rows:
        by_pref[str(row["prefecture"])].append(row)

    output: list[dict[str, Any]] = []
    stats: Counter[str] = Counter()
    matched_admin2: Counter[str] = Counter()
    ambiguous_summary_records = 0
    ambiguous_ner_records = 0
    no_coordinate_input = 0

    for record in records:
        if not is_finite_number(record.get("_lat")) or not is_finite_number(record.get("_lng")):
            no_coordinate_input += 1
        hit, matched_names = match_summary(record, by_pref)
        if hit:
            row = apply_match(record, hit, matched_names, "local_gadm_admin2_summary_exact")
            stats["municipality_summary_exact"] += 1
            matched_admin2[f"{hit['prefecture']} / {hit['admin2']}"] += 1
            output.append(row)
            continue
        if matched_names:
            ambiguous_summary_records += 1

        hit, matched_names = match_ner(record, ner_index)
        if hit:
            row = apply_match(record, hit, matched_names, "local_gadm_admin2_ner_exact")
            stats["municipality_ner_exact"] += 1
            matched_admin2[f"{hit['prefecture']} / {hit['admin2']}"] += 1
            output.append(row)
            continue
        if matched_names:
            ambiguous_ner_records += 1

        row = dict(record)
        row["_geo_level"] = row.get("_geo_level") or "prefecture"
        stats["prefecture_fallback"] += 1
        output.append(row)

    total_municipality = stats["municipality_summary_exact"] + stats["municipality_ner_exact"]
    report = {
        "input_records": len(records),
        "admin2_gazetteer_rows": len(admin2_rows),
        "municipality_records": total_municipality,
        "municipality_share": round(total_municipality / (len(records) or 1), 5),
        "prefecture_fallback_records": stats["prefecture_fallback"],
        "summary_exact_records": stats["municipality_summary_exact"],
        "ner_exact_records": stats["municipality_ner_exact"],
        "ambiguous_summary_records": ambiguous_summary_records,
        "ambiguous_ner_records": ambiguous_ner_records,
        "no_coordinate_input_records": no_coordinate_input,
        "top_admin2_matches": matched_admin2.most_common(40),
        "allowed_admin2_types": sorted(ALLOWED_ADMIN2_TYPES),
        "allow_ner_bare": bool(args.allow_ner_bare),
    }

    atomic_write_json(args.output, output)
    atomic_write_json(args.report, report)

    print("=== Local GADM admin2 geocoding ===")
    print(f"Records: {len(records):,}")
    print(f"Admin2 gazetteer rows: {len(admin2_rows):,}")
    print(f"Municipality records: {total_municipality:,} ({total_municipality / (len(records) or 1):.1%})")
    print(f"  summary exact: {stats['municipality_summary_exact']:,}")
    print(f"  NER exact: {stats['municipality_ner_exact']:,}")
    print(f"Prefecture fallback records: {stats['prefecture_fallback']:,}")
    print(f"Ambiguous summary records: {ambiguous_summary_records:,}")
    print(f"Ambiguous NER records: {ambiguous_ner_records:,}")
    print(f"Saved: {args.output}")
    print(f"Report: {args.report}")


if __name__ == "__main__":
    main()

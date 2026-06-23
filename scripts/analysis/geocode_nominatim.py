#!/usr/bin/env python3
"""Refine Nichibun georeferences with OpenStreetMap Nominatim."""

from __future__ import annotations

import argparse
import json
import os
import time
from collections import Counter
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_INPUT = ROOT / "data" / "nichibun" / "nichibun_ner.json"
DEFAULT_OUTPUT = ROOT / "data" / "nichibun" / "nichibun_georef_final.json"
DEFAULT_CACHE = ROOT / "data" / "nichibun" / "nominatim_cache.json"

EN_PREF_TO_JA = {
    "Hokkaido": "\u5317\u6d77\u9053",
    "Aomori": "\u9752\u68ee\u770c",
    "Iwate": "\u5ca9\u624b\u770c",
    "Miyagi": "\u5bae\u57ce\u770c",
    "Akita": "\u79cb\u7530\u770c",
    "Yamagata": "\u5c71\u5f62\u770c",
    "Fukushima": "\u798f\u5cf6\u770c",
    "Ibaraki": "\u8328\u57ce\u770c",
    "Tochigi": "\u6803\u6728\u770c",
    "Gunma": "\u7fa4\u99ac\u770c",
    "Saitama": "\u57fc\u7389\u770c",
    "Chiba": "\u5343\u8449\u770c",
    "Tokyo": "\u6771\u4eac\u90fd",
    "Kanagawa": "\u795e\u5948\u5ddd\u770c",
    "Niigata": "\u65b0\u6f5f\u770c",
    "Toyama": "\u5bcc\u5c71\u770c",
    "Ishikawa": "\u77f3\u5ddd\u770c",
    "Fukui": "\u798f\u4e95\u770c",
    "Yamanashi": "\u5c71\u68a8\u770c",
    "Nagano": "\u9577\u91ce\u770c",
    "Gifu": "\u5c90\u961c\u770c",
    "Shizuoka": "\u9759\u5ca1\u770c",
    "Aichi": "\u611b\u77e5\u770c",
    "Mie": "\u4e09\u91cd\u770c",
    "Shiga": "\u6ecb\u8cc0\u770c",
    "Kyoto": "\u4eac\u90fd\u5e9c",
    "Osaka": "\u5927\u962a\u5e9c",
    "Hyogo": "\u5175\u5eab\u770c",
    "Nara": "\u5948\u826f\u770c",
    "Wakayama": "\u548c\u6b4c\u5c71\u770c",
    "Tottori": "\u9ce5\u53d6\u770c",
    "Shimane": "\u5cf6\u6839\u770c",
    "Okayama": "\u5ca1\u5c71\u770c",
    "Hiroshima": "\u5e83\u5cf6\u770c",
    "Yamaguchi": "\u5c71\u53e3\u770c",
    "Tokushima": "\u5fb3\u5cf6\u770c",
    "Kagawa": "\u9999\u5ddd\u770c",
    "Ehime": "\u611b\u5a9b\u770c",
    "Kochi": "\u9ad8\u77e5\u770c",
    "Fukuoka": "\u798f\u5ca1\u770c",
    "Saga": "\u4f50\u8cc0\u770c",
    "Nagasaki": "\u9577\u5d0e\u770c",
    "Kumamoto": "\u718a\u672c\u770c",
    "Oita": "\u5927\u5206\u770c",
    "Miyazaki": "\u5bae\u5d0e\u770c",
    "Kagoshima": "\u9e7f\u5150\u5cf6\u770c",
    "Okinawa": "\u6c96\u7e04\u770c",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Geocode Nichibun place mentions with Nominatim.")
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    parser.add_argument(
        "--user-agent",
        default="yokai-folklore-research/contact-required-for-long-runs",
        help="Use an identifying User-Agent. Add contact information for full public Nominatim runs.",
    )
    parser.add_argument("--sleep-seconds", type=float, default=1.0)
    parser.add_argument("--timeout", type=int, default=10)
    parser.add_argument("--max-retries", type=int, default=3)
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--dry-run", action="store_true")
    return parser.parse_args()


def load_records(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        raise FileNotFoundError(
            f"Input not found: {path}. Run scripts/analysis/extract_place_names.py first "
            "or pass --input to an existing nichibun_ner.json file."
        )
    with path.open("r", encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, list):
        raise ValueError(f"Expected list JSON at {path}")
    return [row for row in data if isinstance(row, dict)]


def load_cache(path: Path) -> dict[str, dict[str, Any]]:
    if not path.exists():
        return {}
    with path.open("r", encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, dict):
        return {}
    return {str(key): value for key, value in data.items() if isinstance(value, dict)}


def atomic_write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f"{path.name}.tmp")
    with tmp.open("w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    os.replace(tmp, path)


def cache_key(prefecture: str, place: str) -> str:
    return f"{prefecture}\t{place}"


def build_query(prefecture: str, place: str) -> str:
    if prefecture and prefecture not in place:
        return f"{place}, {prefecture}, Japan"
    return f"{place}, Japan"


def extract_prefecture(raw: dict[str, Any]) -> str:
    address = raw.get("address") if isinstance(raw.get("address"), dict) else {}
    candidates = [address.get("state"), address.get("province"), address.get("region"), address.get("county")]
    display = str(raw.get("display_name") or "")
    for candidate in candidates:
        text = str(candidate or "").strip()
        if text in EN_PREF_TO_JA.values():
            return text
        if text in EN_PREF_TO_JA:
            return EN_PREF_TO_JA[text]
    for ja in EN_PREF_TO_JA.values():
        if ja in display:
            return ja
    for en, ja in EN_PREF_TO_JA.items():
        if en in display:
            return ja
    return ""


def geocode_one(geocoder: Any, prefecture: str, place: str, max_retries: int) -> dict[str, Any]:
    query = build_query(prefecture, place)
    last_error: Exception | None = None
    for attempt in range(1, max_retries + 1):
        try:
            location = geocoder.geocode(query, country_codes="jp", addressdetails=True, exactly_one=True, language="ja")
            if location is None:
                return {"status": "not_found", "query": query, "place": place, "prefecture": prefecture}
            raw = getattr(location, "raw", {}) or {}
            found_prefecture = extract_prefecture(raw)
            common = {
                "query": query,
                "place": place,
                "prefecture": prefecture,
                "found_prefecture": found_prefecture,
                "lat": float(location.latitude),
                "lng": float(location.longitude),
                "display_name": getattr(location, "address", None),
                "raw": raw,
            }
            if prefecture and found_prefecture and found_prefecture != prefecture:
                return {"status": "rejected_prefecture_mismatch", **common}
            return {
                "status": "ok",
                "osm_type": raw.get("osm_type"),
                "osm_id": raw.get("osm_id"),
                "class": raw.get("class"),
                "type": raw.get("type"),
                **common,
            }
        except Exception as exc:  # noqa: BLE001
            last_error = exc
            if attempt < max_retries:
                time.sleep(float(attempt))
    return {"status": "error", "query": query, "place": place, "prefecture": prefecture, "error": str(last_error)}


def unique_queries(records: list[dict[str, Any]]) -> list[tuple[str, str]]:
    seen: set[str] = set()
    out: list[tuple[str, str]] = []
    for record in records:
        pref = str(record.get("prefecture") or "").strip()
        for place in record.get("_place_mentions", []):
            name = str(place).strip()
            if not name:
                continue
            key = cache_key(pref, name)
            if key not in seen:
                seen.add(key)
                out.append((pref, name))
    return out


def choose_hit(record: dict[str, Any], cache: dict[str, dict[str, Any]]) -> dict[str, Any] | None:
    pref = str(record.get("prefecture") or "").strip()
    for place in record.get("_place_mentions", []):
        hit = cache.get(cache_key(pref, str(place)))
        if hit and hit.get("status") == "ok":
            return hit
    return None


def main() -> None:
    args = parse_args()
    records = load_records(args.input)
    if args.limit > 0:
        records = records[: args.limit]
    cache = load_cache(args.cache)
    queries = unique_queries(records)
    pending = [(pref, place) for pref, place in queries if cache_key(pref, place) not in cache]

    print("=== Nominatim geocoding ===")
    print(f"Records: {len(records):,}")
    print(f"Unique place-prefecture queries: {len(queries):,}")
    print(f"Cached queries: {len(cache):,}")
    print(f"Pending queries: {len(pending):,}")
    if args.dry_run:
        for pref, place in pending[:20]:
            print(f"  {build_query(pref, place)}")
        return

    from geopy.geocoders import Nominatim  # type: ignore

    geocoder = Nominatim(user_agent=args.user_agent, timeout=args.timeout)
    for index, (pref, place) in enumerate(pending, start=1):
        result = geocode_one(geocoder, pref, place, args.max_retries)
        cache[cache_key(pref, place)] = result
        atomic_write_json(args.cache, cache)
        print(f"[{index:>5}/{len(pending):>5}] {result['status']}: {build_query(pref, place)}")
        if args.sleep_seconds > 0:
            time.sleep(args.sleep_seconds)

    output: list[dict[str, Any]] = []
    stats: Counter[str] = Counter()
    rejected_records = 0
    for record in records:
        row = dict(record)
        hit = choose_hit(row, cache)
        if hit:
            row["_lat"] = hit["lat"]
            row["_lng"] = hit["lng"]
            row["_geo_level"] = "municipality"
            row["_geocoded_place"] = hit.get("place")
            stats["municipality"] += 1
        else:
            row["_geo_level"] = row.get("_geo_level") or "prefecture"
            stats["prefecture_fallback"] += 1
            pref = str(row.get("prefecture") or "").strip()
            if any(
                cache.get(cache_key(pref, str(place)), {}).get("status") == "rejected_prefecture_mismatch"
                for place in row.get("_place_mentions", [])
            ):
                rejected_records += 1
        output.append(row)

    atomic_write_json(args.output, output)
    total = len(records) or 1
    cache_status = Counter(str(value.get("status") or "unknown") for value in cache.values())
    print("=== Nominatim report ===")
    print(f"Municipality resolution: {stats['municipality']:,} ({stats['municipality'] / total:.1%})")
    print(f"Prefecture fallback: {stats['prefecture_fallback']:,} ({stats['prefecture_fallback'] / total:.1%})")
    print(f"Rejected by prefecture mismatch: {rejected_records:,} ({rejected_records / total:.1%})")
    print("Cache status counts:")
    for status, count in cache_status.most_common():
        print(f"  {status}: {count:,}")
    print(f"Saved: {args.output}")
    print(f"Cache: {args.cache}")


if __name__ == "__main__":
    main()

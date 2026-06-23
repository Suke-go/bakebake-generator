#!/usr/bin/env python3
"""Extract place mentions and terrain terms from Nichibun summaries with GiNZA."""

from __future__ import annotations

import argparse
import json
import os
import re
from collections import Counter
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_INPUT = ROOT / "data" / "nichibun" / "nichibun_georef.json"
DEFAULT_OUTPUT = ROOT / "data" / "nichibun" / "nichibun_ner.json"
DEFAULT_CACHE = ROOT / "data" / "nichibun" / "ner_cache.json"

PLACE_LABELS = {
    "GPE",
    "LOC",
    "FAC",
    "GPE_Other",
    "City",
    "Province",
    "County",
    "Mountain",
    "River",
    "Station",
    "Worship_Place",
    "Facility",
    "Facility_Part",
    "Location_Other",
}
TERRAIN_KEYWORD_CATEGORIES = {
    "water": [
        "\u5ddd",  # 川
        "\u6cb3",  # 河
        "\u6ca2",  # 沢
        "\u6c34",  # 水
        "\u6c60",  # 池
        "\u6cbc",  # 沼
        "\u6e56",  # 湖
        "\u6edd",  # 滝
        "\u4e95\u6238",  # 井戸
        "\u7528\u6c34",  # 用水
        "\u6c34\u8def",  # 水路
    ],
    "mountain": [
        "\u5c71",  # 山
        "\u5ce0",  # 峠
        "\u8c37",  # 谷
        "\u5d16",  # 崖
        "\u68ee",  # 森
        "\u6797",  # 林
        "\u5ca9",  # 岩
        "\u5ca9\u5c4b",  # 岩屋
        "\u6d1e",  # 洞
        "\u6d1e\u7a9f",  # 洞窟
    ],
    "coast": [
        "\u6d77",  # 海
        "\u6d77\u5cb8",  # 海岸
        "\u6d5c",  # 浜
        "\u6d66",  # 浦
        "\u5cf6",  # 島
        "\u5cac",  # 岬
    ],
    "boundary": [
        "\u5742",  # 坂
        "\u6a4b",  # 橋
        "\u9053",  # 道
        "\u8def",  # 路
        "\u8fbb",  # 辻
        "\u5883",  # 境
        "\u95a2",  # 関
    ],
    "agrarian": [
        "\u7530",  # 田
        "\u7530\u3093\u307c",  # 田んぼ
        "\u7551",  # 畑
        "\u91cc",  # 里
        "\u6751",  # 村
    ],
}
TERRAIN_KEYWORDS = [term for terms in TERRAIN_KEYWORD_CATEGORIES.values() for term in terms]
NOISE_PLACE_RE = re.compile(
    r"^[\u5e74\u6708\u65e5\u6642\u5206\u591c\u671d\u663c\u5915\u4e00\u4e8c\u4e09\u56db"
    r"\u4e94\u516d\u4e03\u516b\u4e5d\u5341\u767e\u5343\u4e070-9]+$"
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Extract GiNZA place entities from Nichibun summaries.")
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    parser.add_argument("--model", default="ja_ginza")
    parser.add_argument("--batch-size", type=int, default=100)
    parser.add_argument("--checkpoint-every", type=int, default=1000)
    parser.add_argument("--limit", type=int, default=0)
    return parser.parse_args()


def load_records(path: Path) -> list[dict[str, Any]]:
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
    out: dict[str, dict[str, Any]] = {}
    for key, value in data.items():
        if isinstance(value, dict):
            out[str(key)] = {
                "_place_mentions": [str(x) for x in value.get("_place_mentions", []) if str(x).strip()],
                "_place_mention_spans": [x for x in value.get("_place_mention_spans", []) if isinstance(x, dict)],
                "_terrain_terms": [str(x) for x in value.get("_terrain_terms", []) if str(x).strip()],
                "_terrain_term_categories": sorted(
                    {str(x) for x in value.get("_terrain_term_categories", []) if str(x).strip()}
                ),
            }
    return out


def atomic_write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f"{path.name}.tmp")
    with tmp.open("w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    os.replace(tmp, path)


def unique(values: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for value in values:
        value = value.strip()
        if value and value not in seen:
            seen.add(value)
            out.append(value)
    return out


def normalize_place(value: str) -> str:
    return re.sub(r"\s+", "", value).strip("\u3001\u3002\uff0c\uff0e\u300c\u300d\u300e\u300f()[]")


def is_place(value: str) -> bool:
    return 2 <= len(value) <= 32 and not NOISE_PLACE_RE.match(value)


def is_place_label(label: str) -> bool:
    return label in PLACE_LABELS or label.startswith("GPE") or label.startswith("Facility")


def terrain_categories(terms: list[str]) -> list[str]:
    categories: set[str] = set()
    for category, category_terms in TERRAIN_KEYWORD_CATEGORIES.items():
        if any(term in terms for term in category_terms):
            categories.add(category)
    return sorted(categories)


def extract_from_doc(doc: Any) -> tuple[list[str], list[dict[str, Any]], list[str], list[str]]:
    places: list[str] = []
    spans: list[dict[str, Any]] = []
    for ent in doc.ents:
        if is_place_label(str(ent.label_)):
            name = normalize_place(ent.text)
            if is_place(name):
                places.append(name)
                spans.append(
                    {"text": name, "label": ent.label_, "start": int(ent.start_char), "end": int(ent.end_char)}
                )
    terms = unique([term for term in TERRAIN_KEYWORDS if term in doc.text])
    return unique(places), spans, terms, terrain_categories(terms)


def load_model(name: str) -> Any:
    try:
        import spacy
        import ginza  # noqa: F401
    except ModuleNotFoundError as exc:
        raise ModuleNotFoundError("Install GiNZA with: pip install ginza ja-ginza") from exc
    return spacy.load(name)


def main() -> None:
    args = parse_args()
    records = load_records(args.input)
    if args.limit > 0:
        records = records[: args.limit]
    cache = load_cache(args.cache)
    pending = [row for row in records if str(row.get("id")) not in cache]

    print("=== GiNZA place extraction ===")
    print(f"Input records: {len(records):,}")
    print(f"Cached records: {len(cache):,}")
    print(f"Pending records: {len(pending):,}")

    nlp = load_model(args.model)
    processed = 0
    for start in range(0, len(pending), args.batch_size):
        batch = pending[start : start + args.batch_size]
        texts = [str(row.get("summary") or "") for row in batch]
        for row, doc in zip(batch, nlp.pipe(texts, batch_size=args.batch_size)):
            places, spans, terms, categories = extract_from_doc(doc)
            cache[str(row.get("id"))] = {
                "_place_mentions": places,
                "_place_mention_spans": spans,
                "_terrain_terms": terms,
                "_terrain_term_categories": categories,
            }
            processed += 1
        if args.checkpoint_every > 0 and processed % args.checkpoint_every < args.batch_size:
            atomic_write_json(args.cache, cache)
            print(f"  checkpoint saved ({len(cache):,} cached)")

    atomic_write_json(args.cache, cache)

    output: list[dict[str, Any]] = []
    place_counts: Counter[str] = Counter()
    term_counts: Counter[str] = Counter()
    category_counts: Counter[str] = Counter()
    has_places = 0
    no_places = 0
    has_terms = 0
    for record in records:
        row = dict(record)
        extracted = cache.get(str(row.get("id")), {"_place_mentions": [], "_terrain_terms": []})
        places = unique(extracted.get("_place_mentions", []))
        terms = unique(extracted.get("_terrain_terms", []))
        categories = extracted.get("_terrain_term_categories") or terrain_categories(terms)
        row["_place_mentions"] = places
        row["_place_mention_spans"] = extracted.get("_place_mention_spans", [])
        row["_terrain_terms"] = terms
        row["_terrain_term_categories"] = categories
        output.append(row)
        if places:
            has_places += 1
            place_counts.update(places)
        else:
            no_places += 1
        if terms:
            has_terms += 1
            term_counts.update(terms)
            category_counts.update(categories)

    atomic_write_json(args.output, output)
    print("=== NER report ===")
    print(f"Records with place mentions: {has_places:,}")
    print(f"Records with zero place mentions: {no_places:,}")
    print(f"Records with terrain terms: {has_terms:,}")
    print("Terrain term categories:")
    for category, count in category_counts.most_common():
        print(f"  {category}: {count:,}")
    print("Top 20 place mentions:")
    for place, count in place_counts.most_common(20):
        print(f"  {place}: {count:,}")
    print("Top 20 terrain terms:")
    for term, count in term_counts.most_common(20):
        print(f"  {term}: {count:,}")
    print(f"Saved: {args.output}")
    print(f"Cache: {args.cache}")


if __name__ == "__main__":
    main()

"""
Nichibunken DB batch query for external validation.
Queries all corpus yokai names against the Nichibunken DB to get
independent geographic metadata (region distribution of reports).

Uses existing cache, adds new entries incrementally.
Polite: 2s interval between requests.

Usage: python scripts/analysis/nichibunken_batch.py [--limit 100]
"""

import json, re, time, ssl, sys, urllib.parse, urllib.request, argparse
from pathlib import Path
from collections import Counter

DATA = Path(__file__).resolve().parent.parent.parent / "data"
CLUSTERS_FILE = DATA / "yokai-clusters.json"
CACHE_FILE = DATA / "analysis" / "nichibunken-cache.json"
OUTPUT_FILE = DATA / "analysis" / "nichibunken-validation.json"

BASE_URL = "https://www.nichibun.ac.jp/cgi-bin/YoukaiDB3/areaList_n.cgi"
INTERVAL = 2.0
TIMEOUT = 30
MAX_RETRIES = 2

SSL_CTX = ssl.create_default_context()
SSL_CTX.check_hostname = False
SSL_CTX.verify_mode = ssl.CERT_NONE

PREF_TO_REGION = {}
for reg, prefs in {
    "hokkaido": ["北海道"], "tohoku": ["青森","岩手","宮城","秋田","山形","福島"],
    "kanto": ["茨城","栃木","群馬","埼玉","千葉","東京","神奈川"],
    "chubu": ["新潟","富山","石川","福井","山梨","長野","岐阜","静岡","愛知"],
    "kinki": ["三重","滋賀","京都","大阪","兵庫","奈良","和歌山"],
    "chugoku": ["鳥取","島根","岡山","広島","山口"],
    "shikoku": ["徳島","香川","愛媛","高知"],
    "kyushu": ["福岡","佐賀","長崎","熊本","大分","宮崎","鹿児島","沖縄"],
}.items():
    for p in prefs:
        PREF_TO_REGION[p] = reg


def normalize_name(name):
    name = name.split("\u3001")[0].split(",")[0].strip()
    name = re.sub(r"\[.*?\]", "", name).strip()
    return name


def search_nichibunken(name, cache):
    if name in cache:
        return cache[name]

    encoded = urllib.parse.quote(name, encoding="utf-8")
    area = urllib.parse.quote("\u5168\u56fd", encoding="utf-8")
    url = f"{BASE_URL}?Name={encoded}&Pref=&Area={area}"

    for retry in range(MAX_RETRIES):
        try:
            req = urllib.request.Request(url, headers={
                "User-Agent": "Mozilla/5.0 (Academic Research)",
                "Accept": "text/html",
            })
            with urllib.request.urlopen(req, timeout=TIMEOUT, context=SSL_CTX) as resp:
                html = resp.read().decode("utf-8", errors="replace")

            result = parse_response(html, name)
            cache[name] = result
            return result

        except Exception as e:
            if retry < MAX_RETRIES - 1:
                time.sleep(5 * (retry + 1))
            else:
                result = {
                    "search_name": name,
                    "total_variants": 0,
                    "total_records": 0,
                    "variants": [],
                    "regions_found": [],
                    "error": f"{type(e).__name__}: {e}",
                }
                cache[name] = result
                return result


def parse_response(html, search_name):
    variants = []
    pattern = r'ksearch\.cgi[^"]*"[^>]*>\s*\n?\s*([^\s<(][^<(]*?)\s*\((\d+)\)\s*</[Aa]>'
    matches = re.findall(pattern, html, re.DOTALL)

    for name_text, count_str in matches:
        name_text = name_text.strip()
        count = int(count_str)
        if name_text and count > 0:
            variants.append({"name": name_text, "count": count})

    # Extract region info from area links if available
    regions = []
    area_pattern = r'>\s*([^<]+?)\s*\((\d+)\)\s*</[Aa]>'
    for area_name, count in re.findall(area_pattern, html):
        for pref, reg in PREF_TO_REGION.items():
            if pref in area_name:
                regions.append(reg)

    total_match = re.search(r'\u5168\s*(\d+)\s*\u4ef6', html)
    total_variants = int(total_match.group(1)) if total_match else len(variants)
    total_records = sum(v["count"] for v in variants)

    return {
        "search_name": search_name,
        "total_variants": total_variants,
        "total_records": total_records,
        "variants": sorted(variants, key=lambda x: -x["count"]),
        "regions_found": list(set(regions)),
        "error": None,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=200,
                        help="Max new queries (0=all)")
    args = parser.parse_args()

    # Load corpus yokai names
    with open(CLUSTERS_FILE, "r", encoding="utf-8") as f:
        yokai = json.load(f)["yokai"]

    # Load cache
    cache = {}
    if CACHE_FILE.exists():
        with open(CACHE_FILE, "r", encoding="utf-8") as f:
            cache = json.load(f)

    names = [normalize_name(y["name"]) for y in yokai if len(normalize_name(y["name"])) >= 2]
    unique_names = list(dict.fromkeys(names))  # preserve order, dedup
    already = sum(1 for n in unique_names if n in cache)
    to_query = [n for n in unique_names if n not in cache]

    print(f"Corpus yokai: {len(unique_names)}, cached: {already}, to query: {len(to_query)}")

    if args.limit > 0:
        to_query = to_query[:args.limit]
        print(f"  (limited to {args.limit} new queries)")

    new_count = 0
    err_count = 0

    for i, name in enumerate(to_query):
        sys.stdout.write(f"\r  [{i+1}/{len(to_query)}] {name:20s}")
        sys.stdout.flush()

        result = search_nichibunken(name, cache)
        new_count += 1

        if result.get("error"):
            err_count += 1
            sys.stdout.write(f" -> ERROR")
        else:
            sys.stdout.write(f" -> {result['total_records']} records")

        time.sleep(INTERVAL)

        if new_count % 20 == 0:
            with open(CACHE_FILE, "w", encoding="utf-8") as f:
                json.dump(cache, f, ensure_ascii=False, indent=2)

    # Final save
    with open(CACHE_FILE, "w", encoding="utf-8") as f:
        json.dump(cache, f, ensure_ascii=False, indent=2)

    # Analysis: compare our region labels vs Nichibunken
    print(f"\n\nResults: {new_count} queried, {err_count} errors")
    print(f"Total cache: {len(cache)}")

    # Build validation report
    matched = 0
    with_records = 0
    for name in unique_names:
        if name not in cache:
            continue
        r = cache[name]
        if r.get("error") and r["total_records"] == 0:
            continue
        matched += 1
        if r["total_records"] > 0:
            with_records += 1

    report = {
        "corpus_names": len(unique_names),
        "queried": len(cache),
        "matched_nonzero": with_records,
        "errors": err_count,
    }

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)

    print(f"\nValidation summary:")
    print(f"  Corpus names: {len(unique_names)}")
    print(f"  With Nichibunken records: {with_records}")
    print(f"  Report: {OUTPUT_FILE}")


if __name__ == "__main__":
    main()

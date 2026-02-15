#!/usr/bin/env python3
"""
日文研DB交差分析スクリプト（v2: 堅牢版）

BERTopicクラスタの代表妖怪名を日文研・怪異妖怪伝承DBで検索し、
各クラスタの「生成力」（呼称バリエーション数）を定量化する。

戦略:
- areaList_n.cgi（呼称検索）を使用
- タイムアウト30秒、リトライ2回
- キャッシュ付きで途中再開可能
- 1リクエスト2秒間隔（礼儀正しく）

入力: data/cluster-labels.json
出力: data/analysis/nichibunken-cross.json

Usage: python scripts/analysis/nichibunken_cross.py
"""

import json
import re
import sys
import time
import urllib.parse
import urllib.request
import ssl
from pathlib import Path
from collections import defaultdict

# ── 定数 ──────────────────────────────────────────────
DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"
CLUSTER_FILE = DATA_DIR / "cluster-labels.json"
OUTPUT_DIR = DATA_DIR / "analysis"
OUTPUT_FILE = OUTPUT_DIR / "nichibunken-cross.json"
CACHE_FILE = OUTPUT_DIR / "nichibunken-cache.json"

BASE_URL = "https://www.nichibun.ac.jp/cgi-bin/YoukaiDB3/areaList_n.cgi"
REQUEST_INTERVAL = 2.0  # 秒
MAX_RETRIES = 2
TIMEOUT = 30  # 秒

# SSL検証を緩くする（日文研サーバー対策）
SSL_CTX = ssl.create_default_context()
SSL_CTX.check_hostname = False
SSL_CTX.verify_mode = ssl.CERT_NONE


def load_clusters():
    with open(CLUSTER_FILE, "r", encoding="utf-8") as f:
        return json.load(f)["clusters"]


def load_cache():
    if CACHE_FILE.exists():
        with open(CACHE_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def save_cache(cache):
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    with open(CACHE_FILE, "w", encoding="utf-8") as f:
        json.dump(cache, f, ensure_ascii=False, indent=2)


def normalize_name(name: str) -> str:
    """検索用に名前を正規化"""
    name = name.split("、")[0].split(",")[0].strip()
    name = re.sub(r"\[.*?\]", "", name).strip()
    return name


def search_nichibunken(search_name: str, cache: dict) -> dict:
    """日文研DBの呼称検索を実行"""
    if search_name in cache:
        return cache[search_name]

    encoded = urllib.parse.quote(search_name, encoding="utf-8")
    area = urllib.parse.quote("全国", encoding="utf-8")
    url = f"{BASE_URL}?Name={encoded}&Pref=&Area={area}"

    for retry in range(MAX_RETRIES):
        try:
            req = urllib.request.Request(
                url,
                headers={
                    "User-Agent": "Mozilla/5.0 (Academic Research)",
                    "Accept": "text/html",
                }
            )
            with urllib.request.urlopen(req, timeout=TIMEOUT, context=SSL_CTX) as resp:
                html = resp.read().decode("utf-8", errors="replace")

            result = parse_response(html, search_name)
            cache[search_name] = result
            return result

        except Exception as e:
            if retry < MAX_RETRIES - 1:
                wait = 5 * (retry + 1)
                print(f"      retry {retry+1}: {type(e).__name__}, waiting {wait}s")
                time.sleep(wait)
            else:
                result = {
                    "search_name": search_name,
                    "total_variants": 0,
                    "total_records": 0,
                    "variants": [],
                    "error": f"{type(e).__name__}: {e}",
                }
                cache[search_name] = result
                return result


def parse_response(html: str, search_name: str) -> dict:
    """HTMLから呼称バリエーションと件数を抽出"""
    variants = []

    # HTMLは2行構成:
    # 行1: <a href="ksearch.cgi?...">
    # 行2: カッパサン (2)</A>→...
    # → re.DOTALL で改行をまたいでマッチ
    pattern = r'ksearch\.cgi[^"]*"[^>]*>\s*\n?\s*([^\s<(][^<(]*?)\s*\((\d+)\)\s*</[Aa]>'
    matches = re.findall(pattern, html, re.DOTALL)

    for name_text, count_str in matches:
        name_text = name_text.strip()
        count = int(count_str)
        if name_text and count > 0:
            variants.append({"name": name_text, "count": count})

    # 全件数
    total_match = re.search(r'全\s*(\d+)\s*件', html)
    total_variants = int(total_match.group(1)) if total_match else len(variants)
    total_records = sum(v["count"] for v in variants)

    return {
        "search_name": search_name,
        "total_variants": total_variants,
        "total_records": total_records,
        "variants": sorted(variants, key=lambda x: -x["count"]),
        "error": None,
    }


def main():
    print("日文研DB交差分析 v2\n")

    clusters = load_clusters()
    cache = load_cache()
    cached_count = len(cache)
    print(f"  クラスタ数: {len(clusters)}")
    print(f"  キャッシュ済み: {cached_count}")

    # 各クラスタの代表妖怪を検索
    cluster_results = []
    search_count = 0
    error_count = 0

    for i, (cid, cdata) in enumerate(clusters.items()):
        rep_yokai = cdata.get("representativeYokai", [])[:3]
        search_names = [normalize_name(n) for n in rep_yokai if len(normalize_name(n)) >= 2]

        best_result = None
        best_records = -1

        for name in search_names:
            is_cached = name in cache
            if not is_cached:
                search_count += 1

            print(f"  [{i+1}/{len(clusters)}] T{cid} | {name}", end="")
            if is_cached:
                print(" (cached)", end="")

            result = search_nichibunken(name, cache)

            if not is_cached:
                time.sleep(REQUEST_INTERVAL)

            if result["error"]:
                error_count += 1
                print(f" -> ERROR: {result['error'][:40]}")
            else:
                print(f" -> {result['total_variants']} variants, {result['total_records']} records")

            if result["total_records"] > best_records:
                best_records = result["total_records"]
                best_result = result

        # クラスタの集約結果
        cluster_results.append({
            "cluster_id": int(cid),
            "cluster_size": cdata["size"],
            "representative_words": cdata.get("representativeWords", [])[:5],
            "searched_names": search_names,
            "best_yokai": best_result["search_name"] if best_result else "",
            "max_variants": best_result["total_variants"] if best_result else 0,
            "max_records": best_result["total_records"] if best_result else 0,
            "top_variants": best_result["variants"][:10] if best_result else [],
            "generativity_score": best_result["total_variants"] if best_result else 0,
        })

        # 定期キャッシュ保存
        if search_count > 0 and search_count % 10 == 0:
            save_cache(cache)

    # 最終保存
    save_cache(cache)

    # 出力
    ranked = sorted(cluster_results, key=lambda x: -x["generativity_score"])
    output = {
        "metadata": {
            "description": "日文研DB交差分析: クラスタごとの生成力スコア",
            "source": "怪異・妖怪伝承DB (nichibun.ac.jp)",
            "clusters_analyzed": len(cluster_results),
            "new_searches": search_count,
            "errors": error_count,
        },
        "clusters": ranked,
    }
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    # レポート
    print("\n" + "=" * 70)
    print("  生成力ランキング")
    print("=" * 70)
    print(f"  {'#':>3} {'Cluster':>8} {'Size':>4} {'Variants':>8} {'Records':>8}  Best Yokai")
    print(f"  {'---':>3} {'-------':>8} {'----':>4} {'--------':>8} {'--------':>8}  ----------")

    for i, cr in enumerate(ranked[:25]):
        print(
            f"  {i+1:>3} T{cr['cluster_id']:>7} {cr['cluster_size']:>4} "
            f"{cr['max_variants']:>8} {cr['max_records']:>8}  {cr['best_yokai']}"
        )

    high = sum(1 for cr in ranked if cr["generativity_score"] >= 10)
    mid = sum(1 for cr in ranked if 3 <= cr["generativity_score"] < 10)
    low = sum(1 for cr in ranked if 0 < cr["generativity_score"] < 3)
    zero = sum(1 for cr in ranked if cr["generativity_score"] == 0)

    print(f"\n  高生成力 (>=10): {high} clusters")
    print(f"  中生成力 (3-9):  {mid} clusters")
    print(f"  低生成力 (1-2):  {low} clusters")
    print(f"  未発見 (0):      {zero} clusters")
    print(f"\n  結果: {OUTPUT_FILE}")
    print("=" * 70)


if __name__ == "__main__":
    main()

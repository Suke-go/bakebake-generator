#!/usr/bin/env python3
"""
妖怪名の構造分解スクリプト

BERTopicクラスタ内の妖怪名を形態素辞書でパターンマッチし、
構成パターン（スロット構造）を自動抽出する。

入力: data/cluster-labels.json, data/raw-folklore.json
出力: data/analysis/name-patterns.json

Usage: python scripts/analysis/analyze_name_structure.py
"""

import json
import re
import sys
import io
from pathlib import Path
from collections import Counter, defaultdict

# Windows cp932 対策
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

# ── 定数 ──────────────────────────────────────────────
DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"
CLUSTER_FILE = DATA_DIR / "cluster-labels.json"
FOLKLORE_FILE = DATA_DIR / "raw-folklore.json"
OUTPUT_DIR = DATA_DIR / "analysis"
OUTPUT_FILE = OUTPUT_DIR / "name-patterns.json"

# 妖怪名に頻出する構成要素
SUFFIXES = {
    # 人型
    "坊主": "人型・僧", "入道": "人型・僧", "小僧": "人型・児",
    "太郎": "人型・男", "次郎": "人型・男", "法師": "人型・僧",
    "童子": "人型・児", "女房": "人型・女", "姫": "人型・女",
    "婆": "人型・老女", "爺": "人型・老男", "女": "人型・女",
    "男": "人型・男", "娘": "人型・女", "童": "人型・児",
    "丸": "船/名", "彦": "人型・男",
    # 超自然
    "天狗": "超自然・天狗", "鬼": "超自然・鬼", "神": "超自然・神",
    "仏": "超自然・仏", "精": "超自然・精霊", "魂": "超自然・魂",
    "霊": "超自然・霊", "魔": "超自然・魔",
    # 化け/変化
    "化け": "変化", "お化け": "変化", "おばけ": "変化",
    "変化": "変化", "化け猫": "変化・猫",
    # 火
    "火": "現象・火", "灯": "現象・火", "炎": "現象・火",
    # 動物
    "狐": "動物・狐", "狸": "動物・狸", "猫": "動物・猫",
    "犬": "動物・犬", "蛇": "動物・蛇", "鳥": "動物・鳥",
    "蜘蛛": "動物・蜘蛛", "蟹": "動物・蟹", "鯨": "動物・鯨",
    "馬": "動物・馬", "虎": "動物・虎", "龍": "動物・龍", "竜": "動物・龍",
    # 身体
    "首": "身体・首", "目": "身体・目", "手": "身体・手",
    "足": "身体・足", "顔": "身体・顔", "頭": "身体・頭",
    "舌": "身体・舌", "骨": "身体・骨",
}

PREFIXES = {
    # 場所
    "海": "場所・海", "山": "場所・山", "川": "場所・川",
    "河": "場所・川", "池": "場所・池", "沼": "場所・沼",
    "磯": "場所・磯", "橋": "場所・橋", "道": "場所・道",
    "野": "場所・野", "森": "場所・森", "井": "場所・井戸",
    "天": "場所・天", "地": "場所・地",
    # 時間
    "夜": "時間・夜", "朝": "時間・朝", "夕": "時間・夕",
    # 色
    "赤": "色・赤", "青": "色・青", "白": "色・白",
    "黒": "色・黒", "金": "色・金",
    # サイズ
    "大": "サイズ・大", "小": "サイズ・小", "一": "数・一",
    "百": "数・百", "千": "数・千",
    # 状態
    "古": "状態・古", "送り": "行為・送り", "隠": "行為・隠",
    "飛": "行為・飛", "泣": "行為・泣",
}


def load_data():
    """クラスタデータと民話データの読み込み"""
    with open(CLUSTER_FILE, "r", encoding="utf-8") as f:
        clusters = json.load(f)["clusters"]

    with open(FOLKLORE_FILE, "r", encoding="utf-8") as f:
        folklore = json.load(f)["entries"]

    # name -> summary のマップ
    name_to_summary = {}
    for entry in folklore:
        name_to_summary[entry["name"]] = entry.get("summary", "")

    return clusters, name_to_summary


def normalize_name(name: str) -> str:
    """妖怪名の正規化（複数名称の場合は最初のものを使用）"""
    # 「網切、網剪」→「網切」のように最初の名前を取る
    name = name.split("、")[0].split(",")[0].strip()
    # Wikipedia参照番号を除去
    name = re.sub(r"\[.*?\]", "", name)
    return name.strip()


def detect_suffix(name: str) -> list:
    """名前から接尾辞を検出（長いものから順にチェック）"""
    found = []
    sorted_suffixes = sorted(SUFFIXES.keys(), key=len, reverse=True)
    for suffix in sorted_suffixes:
        if name.endswith(suffix) and len(name) > len(suffix):
            found.append({
                "component": suffix,
                "category": SUFFIXES[suffix],
                "position": "suffix",
                "remaining": name[: -len(suffix)],
            })
            break  # 最長一致で1つのみ
    return found


def detect_prefix(name: str) -> list:
    """名前から接頭辞を検出"""
    found = []
    sorted_prefixes = sorted(PREFIXES.keys(), key=len, reverse=True)
    for prefix in sorted_prefixes:
        if name.startswith(prefix) and len(name) > len(prefix):
            found.append({
                "component": prefix,
                "category": PREFIXES[prefix],
                "position": "prefix",
                "remaining": name[len(prefix):],
            })
            break  # 最長一致で1つのみ
    return found


def detect_embedded(name: str) -> list:
    """名前の内部に含まれる構成要素を検出"""
    found = []
    all_components = {**SUFFIXES, **PREFIXES}
    sorted_components = sorted(all_components.keys(), key=len, reverse=True)
    for comp in sorted_components:
        idx = name.find(comp)
        if idx > 0 and idx < len(name) - len(comp):
            found.append({
                "component": comp,
                "category": all_components[comp],
                "position": "embedded",
                "index": idx,
            })
    return found


def analyze_cluster(cluster_id: str, cluster_data: dict, name_to_summary: dict) -> dict:
    """1クラスタ内の妖怪名を構造分析"""
    yokai_names = cluster_data.get("allYokai", [])
    normalized_names = [normalize_name(n) for n in yokai_names]

    suffix_counter = Counter()
    prefix_counter = Counter()
    suffix_category_counter = Counter()
    prefix_category_counter = Counter()
    decomposed = []

    for raw_name, name in zip(yokai_names, normalized_names):
        suffixes = detect_suffix(name)
        prefixes = detect_prefix(name)
        embedded = detect_embedded(name)

        for s in suffixes:
            suffix_counter[s["component"]] += 1
            suffix_category_counter[s["category"]] += 1
        for p in prefixes:
            prefix_counter[p["component"]] += 1
            prefix_category_counter[p["category"]] += 1

        entry = {
            "name": raw_name,
            "normalized": name,
            "suffixes": suffixes,
            "prefixes": prefixes,
            "embedded": embedded,
            "slot_pattern": _build_slot_pattern(prefixes, suffixes, name),
        }
        decomposed.append(entry)

    # スロット構造の推定
    slot_patterns = Counter()
    for d in decomposed:
        if d["slot_pattern"]:
            slot_patterns[d["slot_pattern"]] += 1

    # クラスタ内で共通する構成要素
    dominant_suffix = suffix_counter.most_common(3) if suffix_counter else []
    dominant_prefix = prefix_counter.most_common(3) if prefix_counter else []

    # 構成パターンの要約
    pattern_summary = _summarize_pattern(
        dominant_prefix, dominant_suffix,
        prefix_category_counter, suffix_category_counter,
        len(yokai_names)
    )

    return {
        "cluster_id": int(cluster_id),
        "cluster_size": cluster_data["size"],
        "representative_words": cluster_data.get("representativeWords", []),
        "yokai_count": len(yokai_names),
        "decomposed_names": decomposed,
        "dominant_suffixes": [{"suffix": s, "count": c} for s, c in dominant_suffix],
        "dominant_prefixes": [{"prefix": p, "count": c} for p, c in dominant_prefix],
        "suffix_categories": dict(suffix_category_counter),
        "prefix_categories": dict(prefix_category_counter),
        "slot_patterns": [{"pattern": p, "count": c} for p, c in slot_patterns.most_common(5)],
        "pattern_summary": pattern_summary,
        "decomposition_rate": sum(1 for d in decomposed if d["slot_pattern"]) / max(len(decomposed), 1),
    }


def _build_slot_pattern(prefixes, suffixes, name) -> str:
    """スロットパターン文字列を構築"""
    parts = []
    if prefixes:
        parts.append(f"[{prefixes[0]['category']}]")
    parts.append("[BASE]")
    if suffixes:
        parts.append(f"[{suffixes[0]['category']}]")
    return " + ".join(parts) if (prefixes or suffixes) else ""


def _summarize_pattern(dom_prefix, dom_suffix, pcat, scat, total) -> str:
    """パターンの自然言語要約"""
    parts = []
    if dom_suffix:
        top = dom_suffix[0]
        pct = top[1] / max(total, 1) * 100
        if pct >= 15:
            parts.append(f"接尾辞「{top[0]}」が{top[1]}体({pct:.0f}%)に共通")
    if dom_prefix:
        top = dom_prefix[0]
        pct = top[1] / max(total, 1) * 100
        if pct >= 15:
            parts.append(f"接頭辞「{top[0]}」が{top[1]}体({pct:.0f}%)に共通")

    # カテゴリベースの要約
    for cat, cnt in sorted(scat.items(), key=lambda x: -x[1]):
        pct = cnt / max(total, 1) * 100
        if pct >= 20 and cat not in [s[0] for s in dom_suffix]:
            parts.append(f"カテゴリ「{cat}」が{cnt}体({pct:.0f}%)")

    return "；".join(parts) if parts else "明確なパターンなし"


def compute_global_stats(cluster_results: list) -> dict:
    """全クラスタ横断の統計"""
    # 全体のスロットパターン集計
    global_patterns = Counter()
    global_suffix_cats = Counter()
    global_prefix_cats = Counter()
    total_yokai = 0
    decomposed_yokai = 0
    high_pattern_clusters = []

    for cr in cluster_results:
        total_yokai += cr["yokai_count"]
        decomposed_yokai += int(cr["decomposition_rate"] * cr["yokai_count"])
        for sp in cr["slot_patterns"]:
            global_patterns[sp["pattern"]] += sp["count"]
        for cat, cnt in cr["suffix_categories"].items():
            global_suffix_cats[cat] += cnt
        for cat, cnt in cr["prefix_categories"].items():
            global_prefix_cats[cat] += cnt
        if cr["decomposition_rate"] >= 0.3:
            high_pattern_clusters.append({
                "cluster_id": cr["cluster_id"],
                "size": cr["cluster_size"],
                "rate": cr["decomposition_rate"],
                "summary": cr["pattern_summary"],
            })

    return {
        "total_yokai": total_yokai,
        "decomposed_yokai": decomposed_yokai,
        "decomposition_rate": decomposed_yokai / max(total_yokai, 1),
        "top_slot_patterns": [
            {"pattern": p, "count": c}
            for p, c in global_patterns.most_common(15)
        ],
        "suffix_categories": dict(global_suffix_cats.most_common(15)),
        "prefix_categories": dict(global_prefix_cats.most_common(15)),
        "high_pattern_clusters": sorted(
            high_pattern_clusters, key=lambda x: -x["rate"]
        ),
    }


def print_report(global_stats: dict, cluster_results: list):
    """ターミナルに結果レポートを出力"""
    print("\n" + "=" * 70)
    print("  妖怪名 構造分解レポート")
    print("=" * 70)

    gs = global_stats
    print(f"\n  全妖怪数: {gs['total_yokai']}")
    print(f"  構造分解成功: {gs['decomposed_yokai']} ({gs['decomposition_rate']:.1%})")

    print("\n── 頻出スロットパターン ──")
    for sp in gs["top_slot_patterns"][:10]:
        print(f"  {sp['pattern']}: {sp['count']}体")

    print("\n── 接尾辞カテゴリ (上位10) ──")
    for cat, cnt in list(gs["suffix_categories"].items())[:10]:
        print(f"  {cat}: {cnt}体")

    print("\n── 接頭辞カテゴリ (上位10) ──")
    for cat, cnt in list(gs["prefix_categories"].items())[:10]:
        print(f"  {cat}: {cnt}体")

    print("\n-- 高パターンクラスタ (分解率 >= 30%) --")
    for hc in gs["high_pattern_clusters"]:
        print(f"  T{hc['cluster_id']} (size={hc['size']}, rate={hc['rate']:.0%}): {hc['summary']}")

    print("\n── クラスタ別ハイライト ──")
    for cr in sorted(cluster_results, key=lambda x: -x["decomposition_rate"]):
        if cr["decomposition_rate"] < 0.2:
            continue
        top_suffix = cr["dominant_suffixes"][0]["suffix"] if cr["dominant_suffixes"] else "-"
        top_prefix = cr["dominant_prefixes"][0]["prefix"] if cr["dominant_prefixes"] else "-"
        print(
            f"  T{cr['cluster_id']:>2} (n={cr['cluster_size']:>2}, "
            f"rate={cr['decomposition_rate']:.0%}): "
            f"prefix={top_prefix}, suffix={top_suffix} | "
            f"{cr['pattern_summary']}"
        )

    print("\n" + "=" * 70)


def main():
    print("妖怪名の構造分解を実行中...\n")

    # データ読み込み
    clusters, name_to_summary = load_data()
    print(f"  クラスタ数: {len(clusters)}")
    print(f"  民話エントリ数: {len(name_to_summary)}")

    # 各クラスタを分析
    cluster_results = []
    for cid, cdata in clusters.items():
        result = analyze_cluster(cid, cdata, name_to_summary)
        cluster_results.append(result)

    # 全体統計
    global_stats = compute_global_stats(cluster_results)

    # 出力
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    output = {
        "metadata": {
            "description": "妖怪名の構造分解結果",
            "source_clusters": str(CLUSTER_FILE),
            "suffix_dictionary_size": len(SUFFIXES),
            "prefix_dictionary_size": len(PREFIXES),
        },
        "global_stats": global_stats,
        "clusters": cluster_results,
    }
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"\n  結果保存: {OUTPUT_FILE}")

    # レポート表示
    print_report(global_stats, cluster_results)


if __name__ == "__main__":
    main()

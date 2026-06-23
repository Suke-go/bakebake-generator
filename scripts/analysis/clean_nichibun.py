#!/usr/bin/env python3
"""
Clean Nichibun yokai records for NichibunEval construction.

Input:
  data/nichibun/nichibun_yokai_full.json

Output:
  data/nichibun/nichibun_cleaned.json

Core steps:
  1. Drop entries with summary length < 10.
  2. Extract prefecture from the raw `prefecture` field with regex.
  3. Map prefecture -> 8-region label (YokaiEval-compatible).
  4. Handle "other" region entries (drop or map to "unknown").
  5. Assign 12-way major category from name_kanji/name_reading.
  6. Assign phenomenon label from summary keyword heuristic.
  7. Build embed_text = "{name}。{prefecture}。{summary}".
"""

from __future__ import annotations

import argparse
import json
import re
from collections import Counter
from pathlib import Path
from typing import Dict, List, Optional


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_INPUT = ROOT / "data" / "nichibun" / "nichibun_yokai_full.json"
DEFAULT_OUTPUT = ROOT / "data" / "nichibun" / "nichibun_cleaned.json"
DEFAULT_REPORT = ROOT / "data" / "nichibun" / "nichibun_cleaned_report.json"


REGION_TO_PREFS: Dict[str, List[str]] = {
    "hokkaido": ["北海道"],
    "tohoku": ["青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県"],
    "kanto": ["茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県"],
    "chubu": ["新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県", "静岡県", "愛知県"],
    "kinki": ["三重県", "滋賀県", "京都府", "大阪府", "兵庫県", "奈良県", "和歌山県"],
    "chugoku": ["鳥取県", "島根県", "岡山県", "広島県", "山口県"],
    "shikoku": ["徳島県", "香川県", "愛媛県", "高知県"],
    "kyushu": ["福岡県", "佐賀県", "長崎県", "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県"],
}

PREF2REG: Dict[str, str] = {
    pref: region for region, prefs in REGION_TO_PREFS.items() for pref in prefs
}

PREF_REGEX = re.compile("|".join(sorted(map(re.escape, PREF2REG.keys()), key=len, reverse=True)))


# Priority-ordered 12-way major classes from name fields.
MAJOR_CATEGORY_RULES: List[tuple[str, List[str]]] = [
    ("キツネ", ["キツネ", "狐", "稲荷"]),
    ("テング", ["テング", "天狗"]),
    ("カッパ", ["カッパ", "河童", "ガラッパ", "エンコ", "カワタロウ", "メドチ", "ヒョウスボ"]),
    ("タヌキ", ["タヌキ", "狸", "ムジナ", "狢", "貉"]),
    ("ヘビ・リュウ", ["ヘビ", "蛇", "大蛇", "白蛇", "竜", "龍", "リュウ"]),
    ("オニ", ["オニ", "鬼", "牛鬼", "羅刹"]),
    ("ユウレイ", ["幽霊", "亡霊", "死霊", "霊", "人魂", "ヒトダマ", "魂"]),
    ("イヌガミ", ["犬神", "イヌガミ", "オサキ", "狼", "山犬"]),
    ("ネコ", ["ネコ", "猫", "化け猫"]),
    ("ヤマノカミ", ["山の神", "山神", "山姥", "ヤマワロ", "山男"]),
    ("ヒノタマ", ["火の玉", "狐火", "鬼火", "怪火", "不知火"]),
]


# Priority labels aligned with paper scripts.
PHENOMENON_RULES: List[tuple[str, List[str]]] = [
    ("shiryo", ["死", "霊", "幽", "亡", "墓", "供養", "祟", "呪", "怨", "成仏"]),
    ("onsei", ["音", "声", "鳴", "叫", "泣", "啼", "笑", "歌", "囁"]),
    ("henka", ["化", "変", "姿", "形", "人間", "女", "男", "老婆", "老人"]),
    ("suihen", ["水", "川", "海", "池", "沼", "泉", "淵", "滝", "河", "湖"]),
    ("sannya", ["山", "森", "林", "道", "峠", "谷", "岩", "石"]),
    ("shikaku", ["光", "火", "影", "見え", "現れ", "消え", "燃", "灯"]),
    ("sesshoku", ["触", "掴", "叩", "投げ", "引", "押", "噛", "絞", "襲"]),
]


def extract_prefecture(raw_prefecture: str) -> Optional[str]:
    if not raw_prefecture:
        return None
    m = PREF_REGEX.search(raw_prefecture)
    return m.group(0) if m else None


def classify_major_category(name_kanji: str, name_reading: str) -> str:
    text = f"{name_kanji} {name_reading}".strip()
    if not text:
        return "その他"
    for label, keywords in MAJOR_CATEGORY_RULES:
        if any(kw in text for kw in keywords):
            return label
    return "その他"


def classify_phenomenon(summary: str) -> Optional[str]:
    if not summary:
        return None
    for label, keywords in PHENOMENON_RULES:
        if any(kw in summary for kw in keywords):
            return label
    return None


def build_embed_text(name: str, prefecture: Optional[str], summary: str) -> str:
    pref = prefecture if prefecture else "不明"
    return f"{name}。{pref}。{summary}"


def clean_records(
    records: List[dict],
    min_summary_len: int,
    other_policy: str,
) -> tuple[List[dict], dict]:
    cleaned: List[dict] = []
    stats = Counter()
    region_counter: Counter[str] = Counter()
    major_counter: Counter[str] = Counter()
    phenomenon_counter: Counter[str] = Counter()

    for row in records:
        stats["input_total"] += 1
        summary = (row.get("summary") or "").strip()
        if len(summary) < min_summary_len:
            stats["dropped_short_summary"] += 1
            continue

        raw_pref = row.get("prefecture") or ""
        pref = extract_prefecture(raw_pref)
        region = PREF2REG.get(pref, "other")

        if region == "other":
            stats["region_other"] += 1
            if other_policy == "drop":
                stats["dropped_other_region"] += 1
                continue
            region = "unknown"

        name = (row.get("name_kanji") or row.get("name_reading") or "").strip()
        name_reading = (row.get("name_reading") or "").strip()
        major = classify_major_category(row.get("name_kanji") or "", name_reading)
        phenomenon = classify_phenomenon(summary)

        out = {
            "id": str(row.get("id", "")),
            "name": name,
            "name_reading": name_reading,
            "region": region,
            "prefecture": pref if pref else "不明",
            "major_category": major,
            "phenomenon": phenomenon if phenomenon else "none",
            "summary": summary,
            "embed_text": build_embed_text(name=name, prefecture=pref, summary=summary),
        }
        cleaned.append(out)
        stats["kept"] += 1
        region_counter[out["region"]] += 1
        major_counter[out["major_category"]] += 1
        phenomenon_counter[out["phenomenon"]] += 1

    report = {
        "input_total": stats["input_total"],
        "kept": stats["kept"],
        "dropped_short_summary": stats["dropped_short_summary"],
        "region_other_before_policy": stats["region_other"],
        "dropped_other_region": stats["dropped_other_region"],
        "other_policy": other_policy,
        "min_summary_len": min_summary_len,
        "region_distribution": dict(region_counter),
        "major_category_distribution": dict(major_counter),
        "phenomenon_distribution": dict(phenomenon_counter),
    }
    return cleaned, report


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Clean Nichibun records for NichibunEval.")
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    parser.add_argument("--min-summary-len", type=int, default=10)
    parser.add_argument(
        "--other-policy",
        choices=["drop", "unknown"],
        default="drop",
        help="How to handle entries whose prefecture does not map to 8 regions.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if not args.input.exists():
        raise FileNotFoundError(f"Input not found: {args.input}")

    with args.input.open("r", encoding="utf-8") as f:
        records = json.load(f)
    cleaned, report = clean_records(
        records=records,
        min_summary_len=args.min_summary_len,
        other_policy=args.other_policy,
    )

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8") as f:
        json.dump(cleaned, f, ensure_ascii=False, indent=2)

    with args.report.open("w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)

    print("=== Nichibun cleaning complete ===")
    print(f"Input:  {args.input}")
    print(f"Output: {args.output}")
    print(f"Report: {args.report}")
    print(f"Kept:   {report['kept']:,}")
    print(f"Dropped short summary: {report['dropped_short_summary']:,}")
    print(f"Dropped other-region:  {report['dropped_other_region']:,}")


if __name__ == "__main__":
    main()

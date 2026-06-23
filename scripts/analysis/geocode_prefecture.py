#!/usr/bin/env python3
"""Assign prefecture centroid coordinates to Nichibun records."""

from __future__ import annotations

import argparse
import json
import os
from collections import Counter
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_INPUT = ROOT / "data" / "nichibun" / "nichibun_cleaned.json"
DEFAULT_OUTPUT = ROOT / "data" / "nichibun" / "nichibun_georef.json"

PREFECTURE_CENTROIDS: dict[str, tuple[float, float]] = {
    "北海道": (43.06417, 141.34694),
    "青森県": (40.82444, 140.74000),
    "岩手県": (39.70361, 141.15250),
    "宮城県": (38.26889, 140.87194),
    "秋田県": (39.71861, 140.10250),
    "山形県": (38.24056, 140.36333),
    "福島県": (37.75000, 140.46778),
    "茨城県": (36.34139, 140.44667),
    "栃木県": (36.56583, 139.88361),
    "群馬県": (36.39111, 139.06083),
    "埼玉県": (35.85694, 139.64889),
    "千葉県": (35.60472, 140.12333),
    "東京都": (35.68944, 139.69167),
    "神奈川県": (35.44778, 139.64250),
    "新潟県": (37.90222, 139.02361),
    "富山県": (36.69528, 137.21139),
    "石川県": (36.59444, 136.62556),
    "福井県": (36.06528, 136.22194),
    "山梨県": (35.66389, 138.56833),
    "長野県": (36.65139, 138.18111),
    "岐阜県": (35.39111, 136.72222),
    "静岡県": (34.97694, 138.38306),
    "愛知県": (35.18028, 136.90667),
    "三重県": (34.73028, 136.50861),
    "滋賀県": (35.00444, 135.86833),
    "京都府": (35.02139, 135.75556),
    "大阪府": (34.68639, 135.52000),
    "兵庫県": (34.69139, 135.18306),
    "奈良県": (34.68528, 135.83278),
    "和歌山県": (34.22611, 135.16750),
    "鳥取県": (35.50361, 134.23833),
    "島根県": (35.47222, 133.05056),
    "岡山県": (34.66167, 133.93500),
    "広島県": (34.39639, 132.45944),
    "山口県": (34.18583, 131.47139),
    "徳島県": (34.06583, 134.55944),
    "香川県": (34.34028, 134.04333),
    "愛媛県": (33.84167, 132.76611),
    "高知県": (33.55972, 133.53111),
    "福岡県": (33.60639, 130.41806),
    "佐賀県": (33.24944, 130.29889),
    "長崎県": (32.74472, 129.87361),
    "熊本県": (32.78972, 130.74167),
    "大分県": (33.23806, 131.61250),
    "宮崎県": (31.91111, 131.42389),
    "鹿児島県": (31.56028, 130.55806),
    "沖縄県": (26.21250, 127.68111),
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Attach prefecture centroids to Nichibun records.")
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    return parser.parse_args()


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


def main() -> None:
    args = parse_args()
    records = load_records(args.input)
    pref_counts: Counter[str] = Counter()
    missing_counts: Counter[str] = Counter()
    geocoded = 0
    output: list[dict[str, Any]] = []

    for record in records:
        row = dict(record)
        pref = str(row.get("prefecture") or "").strip()
        if pref:
            pref_counts[pref] += 1
        centroid = PREFECTURE_CENTROIDS.get(pref)
        if centroid:
            row["_lat"], row["_lng"] = centroid
            row["_geo_level"] = "prefecture"
            geocoded += 1
        else:
            missing_counts[pref or "(blank)"] += 1
        output.append(row)

    atomic_write_json(args.output, output)
    print("=== Prefecture geocoding report ===")
    print(f"Input records: {len(records):,}")
    print(f"Records with coordinates: {geocoded:,}")
    print(f"Unknown/blank prefecture records: {sum(missing_counts.values()):,}")
    print("Records by prefecture:")
    for pref, count in pref_counts.most_common():
        marker = "" if pref in PREFECTURE_CENTROIDS else " [missing centroid]"
        print(f"  {pref}: {count:,}{marker}")
    print(f"Saved: {args.output}")


if __name__ == "__main__":
    main()

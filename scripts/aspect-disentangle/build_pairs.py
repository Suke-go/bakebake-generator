"""
Contrastive pair construction for aspect-disentangled retrieval (3-axis).

Constructs positive/negative pairs along three axes:
  - Topic axis: same/different BERTopic cluster ID
  - Location axis: same/different geographic region
  - Phenomenon axis: same/different phenomenon type (derived from summary text)

Output: data/analysis/contrastive-pairs.json
"""

import json
import random
from collections import defaultdict
from itertools import combinations
from pathlib import Path

# ── paths ──────────────────────────────────────────────────────────────
ROOT = Path(__file__).resolve().parents[2]          # yokai/
DATA = ROOT / "data"
OUT  = DATA / "analysis"

CLUSTERS_FILE   = DATA / "yokai-clusters.json"
EMBEDDINGS_FILE = DATA / "folklore-embeddings.json"

# ── constants ──────────────────────────────────────────────────────────
UNINFORMATIVE_LOCATIONS = {"日本各地", ""}
RANDOM_SEED = 42
MAX_PAIRS_PER_CATEGORY = 5000  # cap to keep training balanced

# ── region mapping ─────────────────────────────────────────────────────
PREFECTURE_TO_REGION = {}
_REGION_MAP = {
    "北海道": ["北海道"],
    "東北": ["青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県"],
    "関東": ["茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県"],
    "中部": ["新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県",
             "岐阜県", "静岡県", "愛知県"],
    "近畿": ["三重県", "滋賀県", "京都府", "大阪府", "兵庫県", "奈良県", "和歌山県"],
    "中国": ["鳥取県", "島根県", "岡山県", "広島県", "山口県"],
    "四国": ["徳島県", "香川県", "愛媛県", "高知県"],
    "九州沖縄": ["福岡県", "佐賀県", "長崎県", "熊本県", "大分県",
                "宮崎県", "鹿児島県", "沖縄県"],
}
for region, prefs in _REGION_MAP.items():
    for p in prefs:
        PREFECTURE_TO_REGION[p] = region


# ── phenomenon type classifier ─────────────────────────────────────────
# Priority-ordered: first match wins (avoids multi-label complexity)
PHENOMENON_TYPES = [
    ("死霊", ["死", "霊", "幽", "亡", "墓", "供養", "祟", "呪", "怨", "成仏", "骸", "骨"]),
    ("音声", ["音", "声", "鳴", "叫", "泣", "啼", "笑", "歌", "囁", "唸", "吠", "鳴く"]),
    ("変化", ["化け", "変化", "化す", "姿を変", "正体", "変身", "狐", "狸", "人に化"]),
    ("水界", ["水", "海", "川", "池", "沼", "湖", "滝", "浜", "磯", "淵", "河", "舟", "船"]),
    ("山野", ["山", "森", "林", "峠", "谷", "野", "原", "岩", "石", "洞", "穴"]),
    ("追跡", ["追", "送", "連れ", "付いて", "後をつけ", "迷", "誘", "惑わ", "道に迷"]),
    ("視覚", ["光", "火", "影", "見え", "現れ", "消え", "燃", "灯", "炎", "輝"]),
    ("接触", ["触", "掴", "叩", "投げ", "引", "押", "噛", "絞", "襲", "打", "殴"]),
]


def classify_phenomenon(summary: str) -> str | None:
    """Classify a summary into its primary phenomenon type."""
    if not summary:
        return None
    for ptype, keywords in PHENOMENON_TYPES:
        for kw in keywords:
            if kw in summary:
                return ptype
    return None


def parse_location(loc_str: str) -> set[str]:
    """Parse multi-prefecture location string into set of region names."""
    if not loc_str or loc_str in UNINFORMATIVE_LOCATIONS:
        return set()
    parts = loc_str.replace("，", "、").split("、")
    regions = set()
    for part in parts:
        part = part.strip()
        if part in PREFECTURE_TO_REGION:
            regions.add(PREFECTURE_TO_REGION[part])
    return regions


def load_entries() -> list[dict]:
    """Load yokai entries with cluster IDs, embeddings, and phenomenon type."""
    with open(CLUSTERS_FILE, "r", encoding="utf-8") as f:
        cluster_data = json.load(f)

    yokai_list = cluster_data["yokai"]

    emb_lookup = {}
    if EMBEDDINGS_FILE.exists():
        with open(EMBEDDINGS_FILE, "r", encoding="utf-8") as f:
            emb_data = json.load(f)
        for entry in emb_data["entries"]:
            emb_lookup[entry["id"]] = entry["embedding"]

    entries = []
    phenom_counts = defaultdict(int)

    for item in yokai_list:
        summary = item.get("summary", "")
        phenom = classify_phenomenon(summary)
        if phenom:
            phenom_counts[phenom] += 1

        entry = {
            "id": item["id"],
            "name": item["name"],
            "summary": summary,
            "location": item.get("location", ""),
            "cluster_id": item.get("clusterId", -1),
            "cluster_confidence": item.get("confidence", 0.0),
            "regions": parse_location(item.get("location", "")),
            "phenomenon": phenom,
            "has_embedding": item["id"] in emb_lookup,
        }
        entries.append(entry)

    print(f"Loaded {len(entries)} entries")
    print(f"  With embeddings: {sum(1 for e in entries if e['has_embedding'])}")
    print(f"  With cluster (≠-1): {sum(1 for e in entries if e['cluster_id'] != -1)}")
    print(f"  With region info: {sum(1 for e in entries if e['regions'])}")
    print(f"  With phenomenon type: {sum(1 for e in entries if e['phenomenon'])}")

    print("\nPhenomenon type distribution:")
    for ptype, count in sorted(phenom_counts.items(), key=lambda x: -x[1]):
        print(f"  {ptype}: {count}")

    return entries


def build_indices(entries: list[dict]):
    """Build inverted indices for cluster, region, and phenomenon."""
    cluster_to_ids = defaultdict(set)
    region_to_ids = defaultdict(set)
    phenom_to_ids = defaultdict(set)
    id_to_idx = {}

    for idx, entry in enumerate(entries):
        eid = entry["id"]
        id_to_idx[eid] = idx

        if entry["cluster_id"] != -1 and entry["has_embedding"]:
            cluster_to_ids[entry["cluster_id"]].add(eid)

        if entry["has_embedding"]:
            for region in entry["regions"]:
                region_to_ids[region].add(eid)

            if entry["phenomenon"]:
                phenom_to_ids[entry["phenomenon"]].add(eid)

    print(f"\nCluster index: {len(cluster_to_ids)} clusters")
    print(f"Region index: {len(region_to_ids)} regions")
    print(f"Phenomenon index: {len(phenom_to_ids)} types")
    for ptype in sorted(phenom_to_ids.keys()):
        print(f"  {ptype}: {len(phenom_to_ids[ptype])} entries")

    return cluster_to_ids, region_to_ids, phenom_to_ids, id_to_idx


def build_pairs(entries, cluster_to_ids, region_to_ids, phenom_to_ids, id_to_idx):
    """Build contrastive pairs along three axes."""
    rng = random.Random(RANDOM_SEED)
    entry_map = {e["id"]: e for e in entries}

    usable_ids = set()
    for e in entries:
        if e["has_embedding"] and e["cluster_id"] != -1:
            usable_ids.add(e["id"])

    print(f"\nUsable entries (has embedding + valid cluster): {len(usable_ids)}")

    # --- Topic axis pairs (same as before) ---
    topic_pos = []
    for cid, members in cluster_to_ids.items():
        valid = [m for m in members if m in usable_ids]
        if len(valid) < 2:
            continue
        for a, b in combinations(valid, 2):
            topic_pos.append((a, b))

    # --- Location axis pairs ---
    location_pos = []
    for region, members in region_to_ids.items():
        valid = [m for m in members if m in usable_ids]
        if len(valid) < 2:
            continue
        for a, b in combinations(valid, 2):
            location_pos.append((a, b))

    # --- Phenomenon axis pairs ---
    phenom_pos = []
    for ptype, members in phenom_to_ids.items():
        valid = [m for m in members if m in usable_ids]
        if len(valid) < 2:
            continue
        for a, b in combinations(valid, 2):
            phenom_pos.append((a, b))

    # Cap each
    for pairs_list in [topic_pos, location_pos, phenom_pos]:
        if len(pairs_list) > MAX_PAIRS_PER_CATEGORY:
            pairs_list[:] = rng.sample(pairs_list, MAX_PAIRS_PER_CATEGORY)

    result = {
        "topic_positive": topic_pos,
        "location_positive": location_pos,
        "phenomenon_positive": phenom_pos,
    }

    print("\n=== Pair Statistics ===")
    for key, p_list in result.items():
        print(f"  {key}: {len(p_list)} pairs")

    return result


def main():
    entries = load_entries()
    cluster_to_ids, region_to_ids, phenom_to_ids, id_to_idx = build_indices(entries)
    pairs = build_pairs(entries, cluster_to_ids, region_to_ids, phenom_to_ids, id_to_idx)

    OUT.mkdir(parents=True, exist_ok=True)
    output_path = OUT / "contrastive-pairs.json"

    # Also save phenomenon labels for evaluation
    phenom_labels = {e["id"]: e["phenomenon"] for e in entries if e["phenomenon"]}

    output = {
        "metadata": {
            "total_entries": len(entries),
            "usable_entries": sum(1 for e in entries if e["has_embedding"] and e["cluster_id"] != -1),
            "num_clusters": len(set(e["cluster_id"] for e in entries if e["cluster_id"] != -1)),
            "num_regions": len(set(r for e in entries for r in e["regions"])),
            "num_phenomenon_types": len(set(e["phenomenon"] for e in entries if e["phenomenon"])),
            "axes": ["topic", "location", "phenomenon"],
        },
        "pairs": pairs,
        "phenomenon_labels": phenom_labels,
    }

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"\nSaved to {output_path}")
    print(f"Total pairs: {sum(len(v) for v in pairs.values())}")


if __name__ == "__main__":
    main()

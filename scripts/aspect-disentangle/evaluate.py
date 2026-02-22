"""
Evaluate 3-axis aspect disentanglement quality.

Metrics:
    1. Probing accuracy per axis (topic/location/phenomenon)
    2. Cross-probing (disentanglement evidence)
    3. Retrieval comparison
    4. Aspect-wise search examples with 3 scores

Usage:
    python evaluate.py [--top-k 5] [--examples 5]
"""

import argparse
import json
from collections import defaultdict
from pathlib import Path

import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import StratifiedKFold
from sklearn.preprocessing import LabelEncoder

import torch
import torch.nn.functional as F


class NumpyEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, np.integer):
            return int(obj)
        if isinstance(obj, np.floating):
            return float(obj)
        if isinstance(obj, np.bool_):
            return bool(obj)
        if isinstance(obj, np.ndarray):
            return obj.tolist()
        return super().default(obj)


# ── paths ──────────────────────────────────────────────────────────────
ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"
ANALYSIS = DATA / "analysis"

EMBEDDINGS_FILE = DATA / "folklore-embeddings.json"
CLUSTERS_FILE = DATA / "yokai-clusters.json"
PAIRS_FILE = ANALYSIS / "contrastive-pairs.json"
WEIGHTS_FILE = ANALYSIS / "projection_weights.pt"
OUTPUT_REPORT = ANALYSIS / "evaluation_report.json"

# ── defaults ────────────────────────────────────────────────────────────
EMBED_DIM = 768
DEFAULT_NUM_AXES = 3
DEFAULT_SUBSPACE_DIM = 128

# ── region mapping ─────────────────────────────────────────────────────
UNINFORMATIVE_LOCATIONS = {"日本各地", ""}
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


def parse_primary_region(loc_str: str) -> str | None:
    if not loc_str or loc_str in UNINFORMATIVE_LOCATIONS:
        return None
    parts = loc_str.replace("，", "、").split("、")
    for part in parts:
        part = part.strip()
        if part in PREFECTURE_TO_REGION:
            return PREFECTURE_TO_REGION[part]
    return None


class AspectProjection(torch.nn.Module):
    def __init__(self, input_dim, num_axes, subspace_dim):
        super().__init__()
        self.num_axes = num_axes
        self.subspace_dim = subspace_dim
        self.projection = torch.nn.Linear(input_dim, num_axes * subspace_dim, bias=False)

    def forward(self, x):
        proj = self.projection(x)
        subspaces = []
        for i in range(self.num_axes):
            s = i * self.subspace_dim
            e = (i + 1) * self.subspace_dim
            subspaces.append(F.normalize(proj[:, s:e], dim=-1))
        return subspaces

    def get_full_projection(self, x):
        return F.normalize(self.projection(x), dim=-1)


def load_data():
    with open(EMBEDDINGS_FILE, "r", encoding="utf-8") as f:
        emb_data = json.load(f)
    emb_lookup = {}
    for entry in emb_data["entries"]:
        emb_lookup[entry["id"]] = {
            "embedding": np.array(entry["embedding"], dtype=np.float32),
            "name": entry["name"],
            "summary": entry.get("summary", ""),
            "location": entry.get("location", ""),
        }

    with open(CLUSTERS_FILE, "r", encoding="utf-8") as f:
        cluster_data = json.load(f)

    # Load phenomenon labels
    phenom_labels = {}
    if PAIRS_FILE.exists():
        with open(PAIRS_FILE, "r", encoding="utf-8") as f:
            pairs_data = json.load(f)
        phenom_labels = pairs_data.get("phenomenon_labels", {})

    entries = []
    for item in cluster_data["yokai"]:
        eid = item["id"]
        if eid not in emb_lookup:
            continue
        entries.append({
            "id": eid,
            "name": item["name"],
            "summary": item.get("summary", ""),
            "location": item.get("location", ""),
            "embedding": emb_lookup[eid]["embedding"],
            "cluster_id": item.get("clusterId", -1),
            "region": parse_primary_region(item.get("location", "")),
            "phenomenon": phenom_labels.get(eid),
        })

    print(f"Loaded {len(entries)} entries with embeddings")
    print(f"  With phenomenon labels: {sum(1 for e in entries if e['phenomenon'])}")
    return entries


def project_all(entries, model):
    embeddings = np.stack([e["embedding"] for e in entries])
    with torch.no_grad():
        x = torch.tensor(embeddings, dtype=torch.float32)
        subspaces = model(x)
        full_proj = model.get_full_projection(x)

    result = {"original": embeddings, "full_proj": full_proj.numpy()}
    axis_names = ["topic", "location", "phenomenon"]
    for i, name in enumerate(axis_names[:len(subspaces)]):
        result[name] = subspaces[i].numpy()
    return result


def probing_evaluation(representations, labels, n_splits=5):
    mask = [l is not None for l in labels]
    X = representations[mask]
    y_raw = [l for l in labels if l is not None]

    if len(set(y_raw)) < 2:
        return {"accuracy": 0.0, "n_samples": len(y_raw), "n_classes": len(set(y_raw)),
                "note": "Too few classes"}

    le = LabelEncoder()
    y = le.fit_transform(y_raw)

    min_class_count = min(np.bincount(y))
    actual_splits = min(n_splits, min_class_count)
    if actual_splits < 2:
        return {"accuracy": 0.0, "n_samples": len(y), "n_classes": len(le.classes_),
                "note": f"Min class count {min_class_count} too small for CV"}

    skf = StratifiedKFold(n_splits=actual_splits, shuffle=True, random_state=42)
    accs = []
    for train_idx, test_idx in skf.split(X, y):
        clf = LogisticRegression(max_iter=1000, solver="lbfgs", C=1.0, random_state=42)
        clf.fit(X[train_idx], y[train_idx])
        accs.append(clf.score(X[test_idx], y[test_idx]))

    return {
        "accuracy": float(np.mean(accs)),
        "std": float(np.std(accs)),
        "n_samples": len(y),
        "n_classes": len(le.classes_),
        "n_folds": actual_splits,
    }


def retrieval_evaluation(repr_matrix, entries, top_k=5):
    sim_matrix = repr_matrix @ repr_matrix.T
    n = len(entries)
    metrics = {"cluster": [], "region": [], "phenomenon": []}

    for i in range(n):
        sims = sim_matrix[i].copy()
        sims[i] = -1
        top_idx = np.argsort(sims)[-top_k:][::-1]

        if entries[i]["cluster_id"] != -1:
            hits = sum(1 for j in top_idx if entries[j]["cluster_id"] == entries[i]["cluster_id"])
            metrics["cluster"].append(hits / top_k)

        if entries[i]["region"]:
            hits = sum(1 for j in top_idx if entries[j]["region"] == entries[i]["region"])
            metrics["region"].append(hits / top_k)

        if entries[i]["phenomenon"]:
            hits = sum(1 for j in top_idx if entries[j]["phenomenon"] == entries[i]["phenomenon"])
            metrics["phenomenon"].append(hits / top_k)

    return {
        f"{k}_precision_at_k": float(np.mean(v)) if v else 0.0
        for k, v in metrics.items()
    }


def show_examples(representations, entries, n_examples=5, top_k=5):
    examples = []
    rng = np.random.RandomState(42)

    valid = [i for i, e in enumerate(entries)
             if e["cluster_id"] != -1 and e["region"] and e["phenomenon"]]

    if len(valid) < n_examples:
        print(f"Only {len(valid)} entries with all 3 labels, showing all")
        n_examples = len(valid)

    sample_idx = rng.choice(valid, size=n_examples, replace=False)

    for qi in sample_idx:
        q = entries[qi]
        # Per-axis similarities
        sims = {}
        for axis in ["topic", "location", "phenomenon"]:
            if axis in representations:
                s = representations[axis][qi] @ representations[axis].T
                s[qi] = -1
                sims[axis] = s

        orig_s = representations["original"][qi] @ representations["original"].T
        orig_s[qi] = -1

        # Combined (average of all axes)
        combined = sum(sims.values()) / len(sims)
        top_idx = np.argsort(combined)[-top_k:][::-1]

        results = []
        for j in top_idx:
            scores = {axis: round(float(sims[axis][j]), 3) for axis in sims}
            scores["original"] = round(float(orig_s[j]), 3)
            scores["combined"] = round(float(combined[j]), 3)
            results.append({
                "name": entries[j]["name"],
                "location": entries[j]["location"],
                "cluster_id": int(entries[j]["cluster_id"]),
                "phenomenon": entries[j]["phenomenon"],
                "scores": scores,
                "match": {
                    "topic": entries[j]["cluster_id"] == q["cluster_id"],
                    "region": entries[j]["region"] == q["region"],
                    "phenomenon": entries[j]["phenomenon"] == q["phenomenon"],
                },
            })

        example = {
            "query": {
                "name": q["name"],
                "location": q["location"],
                "region": q["region"],
                "cluster_id": int(q["cluster_id"]),
                "phenomenon": q["phenomenon"],
                "summary": q["summary"][:120],
            },
            "results": results,
        }
        examples.append(example)

        print(f"\n=== {q['name']} ({q['region']}, cluster {q['cluster_id']}, {q['phenomenon']}) ===")
        print(f"    {q['summary'][:80]}...")
        for r in results:
            flags = []
            if r["match"]["topic"]:
                flags.append("★T")
            if r["match"]["region"]:
                flags.append("★R")
            if r["match"]["phenomenon"]:
                flags.append("★P")
            flag_str = " ".join(flags) if flags else "—"
            print(f"  {r['name']:14s}  t={r['scores']['topic']:.3f}  "
                  f"r={r['scores']['location']:.3f}  "
                  f"p={r['scores']['phenomenon']:.3f}  "
                  f"orig={r['scores']['original']:.3f}  {flag_str}")

    return examples


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--top-k", type=int, default=5)
    parser.add_argument("--examples", type=int, default=5)
    args = parser.parse_args()

    entries = load_data()

    # Load model
    if not WEIGHTS_FILE.exists():
        print(f"ERROR: {WEIGHTS_FILE} not found. Run train_disentangle.py first.")
        return

    checkpoint = torch.load(WEIGHTS_FILE, map_location="cpu", weights_only=False)

    # Handle both old (state_dict only) and new (with config) checkpoints
    if isinstance(checkpoint, dict) and "config" in checkpoint:
        config = checkpoint["config"]
        model = AspectProjection(config["input_dim"], config["num_axes"], config["subspace_dim"])
        model.load_state_dict(checkpoint["model_state_dict"])
        axis_names = config.get("axis_names", ["topic", "location", "phenomenon"])
    else:
        # Legacy 2-axis checkpoint
        model = AspectProjection(EMBED_DIM, DEFAULT_NUM_AXES, DEFAULT_SUBSPACE_DIM)
        model.load_state_dict(checkpoint)
        axis_names = ["topic", "location", "phenomenon"]

    model.eval()
    print(f"Model: {model.num_axes} axes × {model.subspace_dim}d")

    representations = project_all(entries, model)

    # Labels
    cluster_labels = [e["cluster_id"] if e["cluster_id"] != -1 else None for e in entries]
    region_labels = [e["region"] for e in entries]
    phenom_labels = [e["phenomenon"] for e in entries]

    label_map = {
        "cluster": cluster_labels,
        "region": region_labels,
        "phenomenon": phenom_labels,
    }

    report = {}

    # ── 1. Direct Probing ──────────────────────────────────────────
    print("\n" + "=" * 70)
    print("1. DIRECT PROBING (subspace → its target label, should be HIGH)")
    print("=" * 70)

    direct_pairs = [("topic", "cluster"), ("location", "region"), ("phenomenon", "phenomenon")]
    for subspace, label_key in direct_pairs:
        if subspace not in representations:
            continue
        r = probing_evaluation(representations[subspace], label_map[label_key])
        report[f"probing_{subspace}_to_{label_key}"] = r
        print(f"  {subspace:12s} → {label_key:12s}  acc={r['accuracy']:.3f} ± {r.get('std',0):.3f}  "
              f"(N={r['n_samples']}, C={r['n_classes']})")

    # Baselines (original embedding)
    for label_key in ["cluster", "region", "phenomenon"]:
        r = probing_evaluation(representations["original"], label_map[label_key])
        report[f"probing_original_to_{label_key}"] = r
        print(f"  {'original':12s} → {label_key:12s}  acc={r['accuracy']:.3f} ± {r.get('std',0):.3f}")

    # ── 2. Cross-Probing ──────────────────────────────────────────
    print("\n" + "=" * 70)
    print("2. CROSS-PROBING (subspace → OTHER labels, should be LOW)")
    print("=" * 70)

    all_subspaces = [s for s in axis_names if s in representations]
    all_labels = ["cluster", "region", "phenomenon"]

    for subspace in all_subspaces:
        target = direct_pairs[[p[0] for p in direct_pairs].index(subspace)][1]
        for label_key in all_labels:
            if label_key == target:
                continue
            r = probing_evaluation(representations[subspace], label_map[label_key])
            report[f"cross_{subspace}_to_{label_key}"] = r
            print(f"  {subspace:12s} → {label_key:12s}  acc={r['accuracy']:.3f} ± {r.get('std',0):.3f}")

    # ── 3. Retrieval ──────────────────────────────────────────────
    print("\n" + "=" * 70)
    print(f"3. RETRIEVAL PRECISION@{args.top_k}")
    print("=" * 70)

    for repr_name in ["original"] + all_subspaces + ["full_proj"]:
        r = retrieval_evaluation(representations[repr_name], entries, args.top_k)
        report[f"retrieval_{repr_name}"] = r
        parts = [f"{k}={v:.3f}" for k, v in r.items()]
        print(f"  {repr_name:12s}  " + "  ".join(parts))

    # ── 4. Examples ──────────────────────────────────────────────
    print("\n" + "=" * 70)
    print("4. ASPECT-WISE SEARCH EXAMPLES (3-axis scores)")
    print("=" * 70)

    examples = show_examples(representations, entries, args.examples, args.top_k)
    report["examples"] = examples

    ANALYSIS.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_REPORT, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2, cls=NumpyEncoder)

    print(f"\n\nReport saved to: {OUTPUT_REPORT}")


if __name__ == "__main__":
    main()

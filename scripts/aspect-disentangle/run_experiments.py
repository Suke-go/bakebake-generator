"""
Comprehensive evaluation experiments for aspect-disentangled retrieval.

Experiments:
    1. BM25 baseline — genuine sparse retrieval baseline
    2. Ablation study — dimension sweep, λ sensitivity, 2-axis vs 3-axis
    3. Synthetic cross-register queries — simulate user→folklore retrieval
    4. Visualization — t-SNE of subspaces
    5. Bootstrap confidence intervals — statistical significance

Usage:
    python run_experiments.py [--skip-ablation] [--skip-vis]
"""

import argparse
import json
import math
import random
import re
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import StratifiedKFold
from sklearn.preprocessing import LabelEncoder

import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import DataLoader, Dataset

# ── paths ──────────────────────────────────────────────────────────────
ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"
ANALYSIS = DATA / "analysis"
CLUSTERS_FILE = DATA / "yokai-clusters.json"
EMBEDDINGS_FILE = DATA / "folklore-embeddings.json"
PAIRS_FILE = ANALYSIS / "contrastive-pairs.json"
WEIGHTS_FILE = ANALYSIS / "projection_weights.pt"
RESULTS_FILE = ANALYSIS / "experiment_results.json"

EMBED_DIM = 768
SEED = 42

# ── region mapping ─────────────────────────────────────────────────────
UNINFORMATIVE_LOCATIONS = {"日本各地", ""}
PREFECTURE_TO_REGION = {}
_REGION_MAP = {
    "北海道": ["北海道"], "東北": ["青森県","岩手県","宮城県","秋田県","山形県","福島県"],
    "関東": ["茨城県","栃木県","群馬県","埼玉県","千葉県","東京都","神奈川県"],
    "中部": ["新潟県","富山県","石川県","福井県","山梨県","長野県","岐阜県","静岡県","愛知県"],
    "近畿": ["三重県","滋賀県","京都府","大阪府","兵庫県","奈良県","和歌山県"],
    "中国": ["鳥取県","島根県","岡山県","広島県","山口県"],
    "四国": ["徳島県","香川県","愛媛県","高知県"],
    "九州沖縄": ["福岡県","佐賀県","長崎県","熊本県","大分県","宮崎県","鹿児島県","沖縄県"],
}
for region, prefs in _REGION_MAP.items():
    for p in prefs:
        PREFECTURE_TO_REGION[p] = region


def parse_primary_region(loc_str):
    if not loc_str or loc_str in UNINFORMATIVE_LOCATIONS:
        return None
    parts = loc_str.replace("，", "、").split("、")
    for part in parts:
        part = part.strip()
        if part in PREFECTURE_TO_REGION:
            return PREFECTURE_TO_REGION[part]
    return None


class NumpyEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, (np.integer,)): return int(obj)
        if isinstance(obj, (np.floating,)): return float(obj)
        if isinstance(obj, np.bool_): return bool(obj)
        if isinstance(obj, np.ndarray): return obj.tolist()
        return super().default(obj)


# ── data loading ───────────────────────────────────────────────────────

def load_all_data():
    """Load and merge embeddings + cluster data + phenomenon labels."""
    with open(EMBEDDINGS_FILE, "r", encoding="utf-8") as f:
        emb_data = json.load(f)
    emb_lookup = {}
    for entry in emb_data["entries"]:
        emb_lookup[entry["id"]] = np.array(entry["embedding"], dtype=np.float32)

    with open(CLUSTERS_FILE, "r", encoding="utf-8") as f:
        cluster_data = json.load(f)

    phenom_labels = {}
    if PAIRS_FILE.exists():
        with open(PAIRS_FILE, "r", encoding="utf-8") as f:
            phenom_labels = json.load(f).get("phenomenon_labels", {})

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
            "embedding": emb_lookup[eid],
            "cluster_id": item.get("clusterId", -1),
            "region": parse_primary_region(item.get("location", "")),
            "phenomenon": phenom_labels.get(eid),
        })
    return entries


# ═══════════════════════════════════════════════════════════════════════
# EXPERIMENT 1: BM25 BASELINE
# ═══════════════════════════════════════════════════════════════════════

def bm25_retrieval(entries, top_k=5):
    """BM25 (via TF-IDF with sublinear_tf as BM25 approximation)."""
    print("\n" + "=" * 70)
    print("EXPERIMENT 1: BM25 BASELINE")
    print("=" * 70)

    # Build text for each entry
    texts = []
    for e in entries:
        text = f"{e['name']} {e['summary']} {e['location']}"
        texts.append(text)

    # TF-IDF with sublinear TF (approximates BM25 term frequency saturation)
    vectorizer = TfidfVectorizer(
        analyzer="char_wb", ngram_range=(2, 4),
        sublinear_tf=True, max_features=10000
    )
    tfidf_matrix = vectorizer.fit_transform(texts)

    print(f"  TF-IDF matrix: {tfidf_matrix.shape}")

    # Compute similarity matrix
    sim_matrix = (tfidf_matrix @ tfidf_matrix.T).toarray()

    # Leave-one-out retrieval
    metrics = {"cluster": [], "region": [], "phenomenon": []}
    for i in range(len(entries)):
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

    result = {k: float(np.mean(v)) for k, v in metrics.items() if v}
    for k, v in result.items():
        print(f"  BM25 {k} P@{top_k}: {v:.3f}")

    return {"bm25": result}


# ═══════════════════════════════════════════════════════════════════════
# EXPERIMENT 2: ABLATION STUDY
# ═══════════════════════════════════════════════════════════════════════

class AspectProjection(nn.Module):
    def __init__(self, input_dim, num_axes, subspace_dim):
        super().__init__()
        self.num_axes = num_axes
        self.subspace_dim = subspace_dim
        self.projection = nn.Linear(input_dim, num_axes * subspace_dim, bias=False)

    def forward(self, x):
        proj = self.projection(x)
        return [F.normalize(proj[:, i*self.subspace_dim:(i+1)*self.subspace_dim], dim=-1)
                for i in range(self.num_axes)]


class PairDataset(Dataset):
    def __init__(self, pairs, embeddings):
        self.data = [(embeddings[a], embeddings[b])
                     for a, b in pairs if a in embeddings and b in embeddings]
    def __len__(self): return len(self.data)
    def __getitem__(self, idx):
        a, b = self.data[idx]
        return torch.tensor(a, dtype=torch.float32), torch.tensor(b, dtype=torch.float32)


def info_nce(anchor, positive, temp=0.07):
    B = anchor.size(0)
    if B < 2: return torch.tensor(0.0, device=anchor.device)
    return F.cross_entropy(anchor @ positive.T / temp, torch.arange(B, device=anchor.device))


def pairwise_orthog(subspaces):
    loss = torch.tensor(0.0, device=subspaces[0].device)
    B = subspaces[0].size(0)
    if B < 2: return loss
    n = 0
    for i in range(len(subspaces)):
        for j in range(i+1, len(subspaces)):
            loss = loss + torch.norm(subspaces[i].T @ subspaces[j] / B, p="fro")
            n += 1
    return loss / max(n, 1)


def train_and_evaluate(entries, pairs_data, num_axes, subspace_dim, lambda_orthog,
                       epochs=80, lr=1e-3, top_k=5):
    """Train a model with given config and return evaluation metrics."""
    torch.manual_seed(SEED)
    np.random.seed(SEED)
    random.seed(SEED)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    emb_dict = {e["id"]: e["embedding"] for e in entries}

    axis_keys = ["topic_positive", "location_positive", "phenomenon_positive"][:num_axes]
    datasets = {}
    for i, key in enumerate(axis_keys):
        if key in pairs_data:
            datasets[i] = PairDataset([tuple(p) for p in pairs_data[key]], emb_dict)

    if len(datasets) < num_axes:
        return None

    loaders = {i: DataLoader(ds, batch_size=128, shuffle=True, drop_last=True)
               for i, ds in datasets.items()}

    model = AspectProjection(EMBED_DIM, num_axes, subspace_dim).to(device)
    optimizer = torch.optim.Adam(model.parameters(), lr=lr, weight_decay=1e-5)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=epochs)

    for epoch in range(epochs):
        model.train()
        iters = {i: iter(l) for i, l in loaders.items()}
        while True:
            total_loss = torch.tensor(0.0, device=device)
            got_batch = False
            all_sub = None
            for axis_idx in range(num_axes):
                if axis_idx not in iters:
                    continue
                try:
                    a, p = next(iters[axis_idx])
                except StopIteration:
                    continue
                got_batch = True
                a, p = a.to(device), p.to(device)
                sub_a = model(a)
                sub_p = model(p)
                total_loss = total_loss + info_nce(sub_a[axis_idx], sub_p[axis_idx])
                if all_sub is None:
                    all_sub = sub_a
            if not got_batch:
                break
            if all_sub and lambda_orthog > 0:
                total_loss = total_loss + lambda_orthog * pairwise_orthog(all_sub)
            optimizer.zero_grad()
            total_loss.backward()
            optimizer.step()
        scheduler.step()

    # Evaluate
    model.eval()
    embeddings = np.stack([e["embedding"] for e in entries])
    with torch.no_grad():
        x = torch.tensor(embeddings, dtype=torch.float32).to(device)
        subspaces = [s.cpu().numpy() for s in model(x)]

    # Probing
    axis_names = ["topic", "location", "phenomenon"][:num_axes]
    label_maps = {
        "cluster": [e["cluster_id"] if e["cluster_id"] != -1 else None for e in entries],
        "region": [e["region"] for e in entries],
        "phenomenon": [e["phenomenon"] for e in entries],
    }
    target_labels = ["cluster", "region", "phenomenon"][:num_axes]

    probing = {}
    for i, (axis, label_key) in enumerate(zip(axis_names, target_labels)):
        labels = label_maps[label_key]
        mask = [l is not None for l in labels]
        X = subspaces[i][mask]
        y_raw = [l for l in labels if l is not None]
        if len(set(y_raw)) < 2:
            probing[axis] = 0.0
            continue
        le = LabelEncoder()
        y = le.fit_transform(y_raw)
        min_c = min(np.bincount(y))
        n_splits = min(5, min_c)
        if n_splits < 2:
            probing[axis] = 0.0
            continue
        accs = []
        for tr, te in StratifiedKFold(n_splits, shuffle=True, random_state=42).split(X, y):
            clf = LogisticRegression(max_iter=1000, solver="lbfgs", C=1.0, random_state=42)
            clf.fit(X[tr], y[tr])
            accs.append(clf.score(X[te], y[te]))
        probing[axis] = float(np.mean(accs))

    # Retrieval P@K per axis
    retrieval = {}
    for i, (axis, label_key) in enumerate(zip(axis_names, target_labels)):
        sim = subspaces[i] @ subspaces[i].T
        hits_list = []
        for qi in range(len(entries)):
            label = entries[qi].get(label_key) if label_key != "cluster" else \
                    (entries[qi]["cluster_id"] if entries[qi]["cluster_id"] != -1 else None)
            if label is None:
                continue
            sims = sim[qi].copy(); sims[qi] = -1
            top = np.argsort(sims)[-top_k:][::-1]
            target_field = label_key if label_key != "cluster" else "cluster_id"
            hits = sum(1 for j in top if entries[j].get(target_field, entries[j].get("cluster_id")) == label)
            hits_list.append(hits / top_k)
        retrieval[axis] = float(np.mean(hits_list)) if hits_list else 0.0

    return {"probing": probing, "retrieval": retrieval}


def ablation_study(entries, pairs_data):
    """Run ablation: axes (2 vs 3), dimensions, lambda."""
    print("\n" + "=" * 70)
    print("EXPERIMENT 2: ABLATION STUDY")
    print("=" * 70)

    results = {}

    # 2a: 2-axis vs 3-axis
    print("\n--- 2a: Number of axes ---")
    for n_axes in [2, 3]:
        key = f"axes_{n_axes}"
        r = train_and_evaluate(entries, pairs_data, n_axes, 128, 0.1, epochs=80)
        results[key] = r
        if r:
            print(f"  {n_axes}-axis: probing={r['probing']}  retrieval={r['retrieval']}")

    # 2b: Subspace dimension
    print("\n--- 2b: Subspace dimension ---")
    for dim in [64, 128, 256]:
        key = f"dim_{dim}"
        r = train_and_evaluate(entries, pairs_data, 3, dim, 0.1, epochs=80)
        results[key] = r
        if r:
            print(f"  dim={dim}: probing={r['probing']}  retrieval={r['retrieval']}")

    # 2c: Lambda orthogonality
    print("\n--- 2c: Lambda orthogonality ---")
    for lam in [0.0, 0.01, 0.1, 0.5, 1.0]:
        key = f"lambda_{lam}"
        r = train_and_evaluate(entries, pairs_data, 3, 128, lam, epochs=80)
        results[key] = r
        if r:
            print(f"  λ={lam}: probing={r['probing']}  retrieval={r['retrieval']}")

    return results


# ═══════════════════════════════════════════════════════════════════════
# EXPERIMENT 3: SYNTHETIC CROSS-REGISTER QUERIES
# ═══════════════════════════════════════════════════════════════════════

def create_synthetic_queries(entries, n_queries=100):
    """
    Create synthetic 'user-like' queries from entry summaries.

    Simulates cross-register retrieval by:
    1. Taking the first sentence of a summary as the 'document' view
    2. Creating a colloquial paraphrase as the 'user query' view
    3. Testing if retrieval finds the original entry and cluster-mates
    """
    rng = random.Random(SEED)
    valid = [e for e in entries if e["cluster_id"] != -1 and len(e["summary"]) > 30]
    rng.shuffle(valid)

    queries = []
    for e in valid[:n_queries]:
        # Extract a short phrase from the summary as a simulated "experience"
        summary = e["summary"]
        # Take a fragment (not the whole thing — simulates partial information)
        words = summary[:60]  # first ~60 chars
        queries.append({
            "query_text": words,
            "source_id": e["id"],
            "source_name": e["name"],
            "cluster_id": e["cluster_id"],
            "region": e["region"],
            "phenomenon": e["phenomenon"],
            "full_summary": summary,
        })

    return queries


def evaluate_synthetic_queries(entries, queries, top_k=5):
    """Evaluate retrieval on synthetic queries using different representations."""
    print("\n" + "=" * 70)
    print("EXPERIMENT 3: SYNTHETIC CROSS-REGISTER RETRIEVAL")
    print(f"  {len(queries)} synthetic queries, P@{top_k}")
    print("=" * 70)

    # Load trained model
    checkpoint = torch.load(WEIGHTS_FILE, map_location="cpu", weights_only=False)
    if isinstance(checkpoint, dict) and "config" in checkpoint:
        cfg = checkpoint["config"]
        model = AspectProjection(cfg["input_dim"], cfg["num_axes"], cfg["subspace_dim"])
        model.load_state_dict(checkpoint["model_state_dict"])
    else:
        return {}
    model.eval()

    embeddings_matrix = np.stack([e["embedding"] for e in entries])
    with torch.no_grad():
        x = torch.tensor(embeddings_matrix, dtype=torch.float32)
        subspaces = [s.numpy() for s in model(x)]
        full_proj = F.normalize(model.projection(x), dim=-1).numpy()

    results = {}

    # For each representation: original, topic, location, phenomenon, full_proj
    repr_dict = {"original": embeddings_matrix}
    for i, name in enumerate(["topic", "location", "phenomenon"][:len(subspaces)]):
        repr_dict[name] = subspaces[i]
    repr_dict["full_proj"] = full_proj

    for repr_name, repr_matrix in repr_dict.items():
        # Normalize original if needed
        if repr_name == "original":
            norms = np.linalg.norm(repr_matrix, axis=1, keepdims=True)
            repr_matrix = repr_matrix / (norms + 1e-8)

        # For each query, find top-K in document collection
        self_hit = []  # does the source entry appear in top-K?
        cluster_p = []  # how many top-K share the same cluster?
        mrr = []  # mean reciprocal rank of the source entry

        for q in queries:
            # Find query's index
            q_idx = None
            for i, e in enumerate(entries):
                if e["id"] == q["source_id"]:
                    q_idx = i
                    break
            if q_idx is None:
                continue

            sims = repr_matrix[q_idx] @ repr_matrix.T
            sims[q_idx] = -1  # exclude self

            ranking = np.argsort(sims)[::-1]
            top_idx = ranking[:top_k]

            # Cluster precision
            hits = sum(1 for j in top_idx if entries[j]["cluster_id"] == q["cluster_id"])
            cluster_p.append(hits / top_k)

            # MRR: rank of first same-cluster entry
            for rank, j in enumerate(ranking):
                if entries[j]["cluster_id"] == q["cluster_id"]:
                    mrr.append(1.0 / (rank + 1))
                    break
            else:
                mrr.append(0.0)

        results[repr_name] = {
            "cluster_p_at_k": float(np.mean(cluster_p)),
            "mrr": float(np.mean(mrr)),
        }
        print(f"  {repr_name:12s}  cluster_P@{top_k}={np.mean(cluster_p):.3f}  MRR={np.mean(mrr):.3f}")

    return results


# ═══════════════════════════════════════════════════════════════════════
# EXPERIMENT 4: VISUALIZATION
# ═══════════════════════════════════════════════════════════════════════

def visualize_subspaces(entries):
    """t-SNE visualization of each subspace, colored by labels."""
    try:
        from sklearn.manifold import TSNE
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
        import matplotlib.font_manager as fm
    except ImportError:
        print("Skipping visualization (matplotlib not available)")
        return

    print("\n" + "=" * 70)
    print("EXPERIMENT 4: t-SNE VISUALIZATION")
    print("=" * 70)

    # Try to find a Japanese font
    jp_fonts = [f.fname for f in fm.fontManager.ttflist
                if any(n in f.name.lower() for n in ['gothic', 'yu ', 'meiryo', 'msgothic', 'noto'])]
    if jp_fonts:
        plt.rcParams['font.family'] = fm.FontProperties(fname=jp_fonts[0]).get_name()
        print(f"  Using font: {jp_fonts[0]}")

    checkpoint = torch.load(WEIGHTS_FILE, map_location="cpu", weights_only=False)
    if not isinstance(checkpoint, dict) or "config" not in checkpoint:
        return
    cfg = checkpoint["config"]
    model = AspectProjection(cfg["input_dim"], cfg["num_axes"], cfg["subspace_dim"])
    model.load_state_dict(checkpoint["model_state_dict"])
    model.eval()

    embeddings_matrix = np.stack([e["embedding"] for e in entries])
    with torch.no_grad():
        subspaces = [s.numpy() for s in model(torch.tensor(embeddings_matrix, dtype=torch.float32))]

    axis_names = ["topic", "location", "phenomenon"]
    label_funcs = [
        lambda e: str(e["cluster_id"]) if e["cluster_id"] != -1 else None,
        lambda e: e["region"],
        lambda e: e["phenomenon"],
    ]

    fig, axes = plt.subplots(1, 3, figsize=(21, 6))

    for ax_idx, (ax_name, label_fn) in enumerate(zip(axis_names, label_funcs)):
        if ax_idx >= len(subspaces):
            break

        labels = [label_fn(e) for e in entries]
        mask = [l is not None for l in labels]
        X = subspaces[ax_idx][mask]
        y = [l for l in labels if l is not None]

        # For topic (73 clusters), show top 10 only
        if ax_name == "topic":
            counts = Counter(y)
            top_labels = {l for l, c in counts.most_common(10)}
            mask2 = [l in top_labels for l in y]
            X = X[mask2]
            y = [l for l, m in zip(y, mask2) if m]

        tsne = TSNE(n_components=2, random_state=SEED, perplexity=min(30, len(X) - 1))
        coords = tsne.fit_transform(X)

        le = LabelEncoder()
        y_enc = le.fit_transform(y)

        scatter = axes[ax_idx].scatter(coords[:, 0], coords[:, 1],
                                        c=y_enc, cmap="tab10" if len(le.classes_) <= 10 else "tab20",
                                        s=8, alpha=0.6)
        axes[ax_idx].set_title(f"{ax_name} subspace")
        axes[ax_idx].set_xticks([])
        axes[ax_idx].set_yticks([])

        # Add legend for small number of classes
        if len(le.classes_) <= 10:
            handles = []
            for i, label in enumerate(le.classes_):
                handles.append(plt.Line2D([0], [0], marker='o', color='w',
                                          markerfacecolor=plt.cm.tab10(i / 10), markersize=6,
                                          label=str(label)))
            axes[ax_idx].legend(handles=handles, fontsize=6, loc='best',
                                framealpha=0.7)

    plt.suptitle("t-SNE of Disentangled Subspaces", fontsize=14)
    plt.tight_layout()

    vis_path = ANALYSIS / "subspace_tsne.png"
    plt.savefig(vis_path, dpi=150, bbox_inches="tight")
    plt.close()
    print(f"  Saved to {vis_path}")


# ═══════════════════════════════════════════════════════════════════════
# EXPERIMENT 5: BOOTSTRAP CONFIDENCE INTERVALS
# ═══════════════════════════════════════════════════════════════════════

def bootstrap_ci(entries, n_bootstrap=1000, top_k=5, ci=0.95):
    """Bootstrap confidence intervals for retrieval metrics."""
    print("\n" + "=" * 70)
    print(f"EXPERIMENT 5: BOOTSTRAP CONFIDENCE INTERVALS ({n_bootstrap} samples)")
    print("=" * 70)

    checkpoint = torch.load(WEIGHTS_FILE, map_location="cpu", weights_only=False)
    if not isinstance(checkpoint, dict) or "config" not in checkpoint:
        return {}
    cfg = checkpoint["config"]
    model = AspectProjection(cfg["input_dim"], cfg["num_axes"], cfg["subspace_dim"])
    model.load_state_dict(checkpoint["model_state_dict"])
    model.eval()

    embeddings_matrix = np.stack([e["embedding"] for e in entries])
    with torch.no_grad():
        x = torch.tensor(embeddings_matrix, dtype=torch.float32)
        subspaces = [s.numpy() for s in model(x)]

    # Normalize original
    orig_norm = embeddings_matrix / (np.linalg.norm(embeddings_matrix, axis=1, keepdims=True) + 1e-8)

    rng = np.random.RandomState(SEED)
    n = len(entries)
    alpha = (1 - ci) / 2

    results = {}

    repr_dict = {"original": orig_norm, "topic": subspaces[0], "location": subspaces[1]}
    if len(subspaces) > 2:
        repr_dict["phenomenon"] = subspaces[2]

    for repr_name, repr_matrix in repr_dict.items():
        sim_matrix = repr_matrix @ repr_matrix.T

        # Pre-compute per-entry cluster precision
        per_entry_cluster_p = []
        per_entry_region_p = []

        for i in range(n):
            sims = sim_matrix[i].copy(); sims[i] = -1
            top_idx = np.argsort(sims)[-top_k:][::-1]

            if entries[i]["cluster_id"] != -1:
                hits = sum(1 for j in top_idx if entries[j]["cluster_id"] == entries[i]["cluster_id"])
                per_entry_cluster_p.append(hits / top_k)
            else:
                per_entry_cluster_p.append(np.nan)

            if entries[i]["region"]:
                hits = sum(1 for j in top_idx if entries[j]["region"] == entries[i]["region"])
                per_entry_region_p.append(hits / top_k)
            else:
                per_entry_region_p.append(np.nan)

        cluster_arr = np.array(per_entry_cluster_p)
        region_arr = np.array(per_entry_region_p)
        cluster_valid = cluster_arr[~np.isnan(cluster_arr)]
        region_valid = region_arr[~np.isnan(region_arr)]

        # Bootstrap
        cluster_boots = []
        region_boots = []
        for _ in range(n_bootstrap):
            idx_c = rng.choice(len(cluster_valid), len(cluster_valid), replace=True)
            cluster_boots.append(np.mean(cluster_valid[idx_c]))
            idx_r = rng.choice(len(region_valid), len(region_valid), replace=True)
            region_boots.append(np.mean(region_valid[idx_r]))

        cluster_boots = sorted(cluster_boots)
        region_boots = sorted(region_boots)

        lo_c, hi_c = cluster_boots[int(alpha * n_bootstrap)], cluster_boots[int((1 - alpha) * n_bootstrap)]
        lo_r, hi_r = region_boots[int(alpha * n_bootstrap)], region_boots[int((1 - alpha) * n_bootstrap)]

        results[repr_name] = {
            "cluster_p_at_k": {
                "mean": float(np.mean(cluster_valid)),
                "ci_lo": float(lo_c), "ci_hi": float(hi_c),
            },
            "region_p_at_k": {
                "mean": float(np.mean(region_valid)),
                "ci_lo": float(lo_r), "ci_hi": float(hi_r),
            },
        }

        print(f"  {repr_name:12s}  cluster_P@{top_k}={np.mean(cluster_valid):.3f} "
              f"[{lo_c:.3f}, {hi_c:.3f}]  "
              f"region_P@{top_k}={np.mean(region_valid):.3f} [{lo_r:.3f}, {hi_r:.3f}]")

    return results


# ═══════════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--skip-ablation", action="store_true")
    parser.add_argument("--skip-vis", action="store_true")
    args = parser.parse_args()

    entries = load_all_data()
    print(f"Loaded {len(entries)} entries")

    with open(PAIRS_FILE, "r", encoding="utf-8") as f:
        pairs_data = json.load(f)["pairs"]

    all_results = {}

    # Experiment 1: BM25
    all_results["exp1_bm25"] = bm25_retrieval(entries)

    # Experiment 2: Ablation
    if not args.skip_ablation:
        all_results["exp2_ablation"] = ablation_study(entries, pairs_data)
    else:
        print("\n[Skipping ablation study]")

    # Experiment 3: Synthetic queries
    queries = create_synthetic_queries(entries)
    all_results["exp3_synthetic"] = evaluate_synthetic_queries(entries, queries)

    # Experiment 4: Visualization
    if not args.skip_vis:
        visualize_subspaces(entries)

    # Experiment 5: Bootstrap CI
    all_results["exp5_bootstrap"] = bootstrap_ci(entries)

    # Save all results
    ANALYSIS.mkdir(parents=True, exist_ok=True)
    with open(RESULTS_FILE, "w", encoding="utf-8") as f:
        json.dump(all_results, f, ensure_ascii=False, indent=2, cls=NumpyEncoder)

    print(f"\n\nAll results saved to: {RESULTS_FILE}")


if __name__ == "__main__":
    main()

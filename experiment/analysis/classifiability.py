"""Compute each generated yokai's nearest-neighbor cosine similarity
to the 35,305-entry Nichibunken corpus, and identify outliers
(yokai whose content is not classifiable within the historical corpus).
"""
import json, numpy as np, pandas as pd, sys, csv
from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity

sys.stdout.reconfigure(encoding="utf-8")

NICHIBUN_DIR = r"c:\Users\kosuk\yokai\data\nichibun"
GEN_CSV      = r"c:\Users\kosuk\yokai\experiment\data\surveys_raw.csv"
OUT_JSON     = r"c:\Users\kosuk\yokai\experiment\data\classifiability.json"

print("Loading corpus embeddings...")
corpus_emb = np.load(f"{NICHIBUN_DIR}\\nichibun_e5_embeddings.npy")
print(f"  shape: {corpus_emb.shape}")

print("Loading corpus metadata (names + summaries)...")
ids, names, summaries = [], [], []
with open(f"{NICHIBUN_DIR}\\nichibun_yokai_full.csv", encoding="utf-8") as f:
    reader = csv.DictReader(f)
    for row in reader:
        ids.append(row.get("record_id", ""))
        names.append(row.get("name_kanji") or row.get("name_reading", ""))
        summaries.append(row.get("summary", ""))
print(f"  {len(ids)} entries (alignment check: {len(ids) == corpus_emb.shape[0]})")

print("Loading generated yokai...")
raw = pd.read_csv(GEN_CSV)
gen = raw[raw["yokai_name"].notna() & raw["yokai_desc"].notna()].copy()
gen = gen.reset_index(drop=True)
print(f"  {len(gen)} generated yokai")

print("Loading multilingual-e5-small model...")
model = SentenceTransformer("intfloat/multilingual-e5-small")

print("Embedding generated yokai...")
texts = [f"passage: {n} {d}" for n, d in zip(gen["yokai_name"], gen["yokai_desc"])]
gen_emb = model.encode(texts, normalize_embeddings=True, show_progress_bar=False, batch_size=16)
print(f"  embedded shape: {gen_emb.shape}")

print("Normalizing corpus embeddings...")
corpus_norm = corpus_emb / np.linalg.norm(corpus_emb, axis=1, keepdims=True).clip(min=1e-10)

print("Computing cosine similarities to corpus...")
sims = cosine_similarity(gen_emb, corpus_norm)
print(f"  similarity matrix: {sims.shape}")

max_sims     = sims.max(axis=1)
max_indices  = sims.argmax(axis=1)
mean_top5    = np.sort(sims, axis=1)[:, -5:].mean(axis=1)

records = []
for i, row in gen.iterrows():
    nn_idx = int(max_indices[i])
    records.append({
        "yokai_name": row["yokai_name"],
        "yokai_desc": str(row["yokai_desc"])[:200],
        "pre_image":  row.get("pre_image"),
        "visitor_type": row.get("visitor_type"),
        "created_at": row["created_at"],
        "max_similarity": float(max_sims[i]),
        "mean_top5_similarity": float(mean_top5[i]),
        "nearest_id":   ids[nn_idx],
        "nearest_name": names[nn_idx],
        "nearest_summary": summaries[nn_idx][:200],
    })

records.sort(key=lambda r: r["max_similarity"])

with open(OUT_JSON, "w", encoding="utf-8") as f:
    json.dump(records, f, ensure_ascii=False, indent=2)

print("\n" + "="*72)
print("DISTRIBUTION OF max-cosine-similarity to nearest Nichibunken entry")
print("="*72)
arr = np.array([r["max_similarity"] for r in records])
print(f"n={len(arr)}")
print(f"min:    {arr.min():.4f}")
print(f"q05:    {np.percentile(arr, 5):.4f}")
print(f"q25:    {np.percentile(arr, 25):.4f}")
print(f"median: {np.median(arr):.4f}")
print(f"q75:    {np.percentile(arr, 75):.4f}")
print(f"q95:    {np.percentile(arr, 95):.4f}")
print(f"max:    {arr.max():.4f}")
print(f"mean:   {arr.mean():.4f} (sd {arr.std():.4f})")

# Histogram (text)
print("\nHistogram of max-similarity (binned):")
bins = np.linspace(arr.min() - 0.001, arr.max() + 0.001, 11)
hist, edges = np.histogram(arr, bins=bins)
for h, lo, hi in zip(hist, edges[:-1], edges[1:]):
    bar = "█" * h
    print(f"  [{lo:.3f}, {hi:.3f})  {h:>2}  {bar}")

print("\n" + "="*72)
print("LOWEST 10 (least classifiable within the corpus)")
print("="*72)
for r in records[:10]:
    print(f"\n  {r['max_similarity']:.4f}  【{r['yokai_name']}】  (pre_image={r['pre_image']})")
    print(f"    desc: {r['yokai_desc']}")
    print(f"    nearest in corpus: {r['nearest_name']} ({r['nearest_id']})  sim={r['max_similarity']:.4f}")
    print(f"      → {r['nearest_summary']}")

print("\n" + "="*72)
print("HIGHEST 5 (most directly precedented)")
print("="*72)
for r in records[-5:]:
    print(f"\n  {r['max_similarity']:.4f}  【{r['yokai_name']}】")
    print(f"    nearest: {r['nearest_name']}")

print(f"\nFull records saved to {OUT_JSON}")

"""Where does the account most like each record lie?

For every record of the folklore database, find the nearest other record by the similarity used in /hyakki
(name-masked E5 vectors, mean removed, cosine), leaving out records from the same source document, and count
how far away it was recorded. The same counts are given for a neighbour drawn at random, as the chance level.

Reads   data/nichibun/nichibun_enriched.json, data/archive-race/vectors-motif.f32
Writes  paper/hyakki/analysis.json
Run     python -X utf8 scripts/hyakki/analyze_geography.py
"""
import json
import re
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
BANDS = [("same prefecture", 0), ("within 150 km", 150), ("150-500 km", 500), ("over 500 km", float("inf"))]
MIN_KIND = 100


def km(a, b):
    lat1, lon1, lat2, lon2 = map(np.radians, (a[0], a[1], b[0], b[1]))
    h = np.sin((lat2 - lat1) / 2) ** 2 + np.cos(lat1) * np.cos(lat2) * np.sin((lon2 - lon1) / 2) ** 2
    return float(2 * 6371 * np.arcsin(np.sqrt(h)))


def main():
    records = json.loads((ROOT / "data/nichibun/nichibun_enriched.json").read_text(encoding="utf-8"))
    vectors = np.fromfile(ROOT / "data/archive-race/vectors-motif.f32", dtype="<f4").reshape(len(records), -1)
    keep = [i for i, r in enumerate(records) if r.get("prefecture") and r.get("_lat")]
    records = [records[i] for i in keep]
    v = vectors[keep].astype(np.float32)
    v -= v.mean(axis=0)
    v /= np.linalg.norm(v, axis=1, keepdims=True)

    prefs = sorted({r["prefecture"] for r in records})
    pid = np.array([prefs.index(r["prefecture"]) for r in records])
    centre = [tuple(np.median([[float(r["_lat"]), float(r["_lng"])] for r in records if r["prefecture"] == p], axis=0)) for p in prefs]
    dist = np.array([[km(a, b) for b in centre] for a in centre])
    band = np.zeros_like(dist, dtype=int)                       # prefecture x prefecture -> band index
    for k, (_, limit) in enumerate(BANDS[1:], start=1):
        band[(dist > BANDS[k - 1][1]) & (dist <= limit)] = k
    np.fill_diagonal(band, 0)

    source = np.array([r["id"].split("_")[0] for r in records])
    kind = [re.split(r"[，,、(（]", r["name"].strip())[0] for r in records]

    n = len(records)
    nearest = np.empty(n, dtype=int)
    score = np.empty(n, dtype=np.float32)
    for start in range(0, n, 2000):
        sims = v[start:start + 2000] @ v.T
        for row in range(sims.shape[0]):
            sims[row, source == source[start + row]] = -2      # not itself, nor its own source document
        nearest[start:start + 2000] = sims.argmax(axis=1)
        score[start:start + 2000] = sims.max(axis=1)

    seen = Counter(int(band[pid[i], pid[nearest[i]]]) for i in range(n))
    # chance: a neighbour drawn uniformly from the records of other source documents
    size = np.bincount(pid, minlength=len(prefs))
    chance = np.zeros(len(BANDS))
    for p in range(len(prefs)):
        for q in range(len(prefs)):
            chance[band[p, q]] += size[p] * size[q]
    chance /= chance.sum()

    by_kind = defaultdict(list)
    for i in range(n):
        by_kind[kind[i]].append(i)
    kinds = []
    for name, rows in by_kind.items():
        if len(rows) < MIN_KIND:
            continue
        far = sum(band[pid[i], pid[nearest[i]]] >= 2 for i in rows) / len(rows)
        same = sum(band[pid[i], pid[nearest[i]]] == 0 for i in rows) / len(rows)
        kin = sum(kind[nearest[i]] == name for i in rows) / len(rows)
        kinds.append({"kind": name, "records": len(rows), "beyond150km": round(far, 3), "samePrefecture": round(same, 3), "sameKind": round(kin, 3)})
    kinds.sort(key=lambda k: -k["beyond150km"])

    nn_km = np.array([dist[pid[i], pid[nearest[i]]] for i in range(n)])
    rng = np.random.default_rng(0)
    rand_km = dist[pid, pid[rng.permutation(n)]]
    out = {
        "records": n, "prefectures": len(prefs), "sources": int(len(set(source))),
        "bands": [{"band": BANDS[k][0], "nearest": round(seen[k] / n, 4), "chance": round(float(chance[k]), 4)} for k in range(len(BANDS))],
        "medianKm": {"nearest": round(float(np.median(nn_km)), 1), "random": round(float(np.median(rand_km)), 1)},
        "nearestCosine": {"median": round(float(np.median(score)), 3), "p10": round(float(np.percentile(score, 10)), 3), "p90": round(float(np.percentile(score, 90)), 3)},
        "nearestSameKind": round(sum(kind[nearest[i]] == kind[i] for i in range(n)) / n, 4),
        "kindsCounted": len(kinds), "kindsFarthest": kinds[:8], "kindsNearest": kinds[-8:][::-1],
    }
    (ROOT / "paper/hyakki/analysis.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    print(json.dumps(out, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()

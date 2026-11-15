"""Where does the account most like each record lie?

For every record of the folklore database, find the nearest other record by the text similarity used in /hyakki
(name-masked E5 vectors, mean removed, cosine) and count how far away it was recorded, against a neighbour drawn
at random. Because the nearest record need not be a related one, and because records filed together may share
an author or a journal, the counts are repeated under stricter conditions:

  threshold   only records whose nearest neighbour reaches a cosine of 0.5 / 0.6 / 0.7
  exclusion   which candidates are left out. Record numbers follow cataloguing order: consecutive numbers are
              accounts taken from one source, and the first four digits mark a batch catalogued together (one
              journal or series). The data has no author or journal field, so these stand in for them.
                self     only the record itself
                near     records within 50 of the record's own number
                batch    every record of the same batch
  placeless   vectors from summaries with place names masked too (scripts/hyakki/embed_placeless.py)

Reads   data/nichibun/nichibun_enriched.json, data/archive-race/vectors-motif.f32,
        data/hyakki/analysis/vectors-placeless.f32 (optional)
Writes  paper/hyakki/analysis.json, paper/hyakki/validation_pairs.csv (100 random nearest pairs, for rating by hand)
Run     python -X utf8 scripts/hyakki/analyze_geography.py
"""
import csv
import json
import re
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
BANDS = [("same prefecture", 0), ("within 100 km", 100), ("100-200 km", 200), ("200-400 km", 400), ("400-800 km", 800), ("over 800 km", float("inf"))]
MIN_KIND = 100


def km(a, b):
    lat1, lon1, lat2, lon2 = map(np.radians, (a[0], a[1], b[0], b[1]))
    h = np.sin((lat2 - lat1) / 2) ** 2 + np.cos(lat1) * np.cos(lat2) * np.sin((lon2 - lon1) / 2) ** 2
    return float(2 * 6371 * np.arcsin(np.sqrt(h)))


def centred(v):
    v = v.astype(np.float32)
    v = v - v.mean(axis=0)          # the mean over all records of the database
    return v / np.linalg.norm(v, axis=1, keepdims=True)


def nearest(v, number, batch, exclusion):
    n = len(v)
    idx = np.empty(n, dtype=int)
    score = np.empty(n, dtype=np.float32)
    for start in range(0, n, 1500):
        sims = v[start:start + 1500] @ v.T
        rows = np.arange(start, min(start + 1500, n))
        sims[np.arange(len(rows)), rows] = -2
        if exclusion == "near":
            sims[(batch[rows][:, None] == batch[None, :]) & (np.abs(number[rows][:, None] - number[None, :]) <= 50)] = -2
        elif exclusion == "batch":
            sims[batch[rows][:, None] == batch[None, :]] = -2
        idx[start:start + 1500] = sims.argmax(axis=1)
        score[start:start + 1500] = sims.max(axis=1)
    return idx, score


def main():
    records = json.loads((ROOT / "data/nichibun/nichibun_enriched.json").read_text(encoding="utf-8"))
    raw = {"names masked": np.fromfile(ROOT / "data/archive-race/vectors-motif.f32", dtype="<f4").reshape(len(records), -1)}
    placeless = ROOT / "data/hyakki/analysis/vectors-placeless.f32"
    if placeless.exists():
        raw["names and places masked"] = np.fromfile(placeless, dtype="<f4").reshape(len(records), -1)

    # Left out: bundles of superstitions filed without an account ("a bundle of omens of death"), which repeat the
    # same sentence across the country, and summaries too short to describe an event.
    keep = [i for i, r in enumerate(records) if "俗信" not in r["name"] and len(r["summary"]) >= 30]
    dropped = len(records) - len(keep)
    records = [records[i] for i in keep]
    raw = {label: v[keep] for label, v in raw.items()}
    n = len(records)
    prefs = sorted({r["prefecture"] for r in records})
    pid = np.array([prefs.index(r["prefecture"]) for r in records])
    centre = [tuple(np.median([[float(r["_lat"]), float(r["_lng"])] for r in records if r["prefecture"] == p], axis=0)) for p in prefs]
    dist = np.array([[km(a, b) for b in centre] for a in centre])
    band = np.zeros_like(dist, dtype=int)
    for k in range(1, len(BANDS)):
        band[(dist > BANDS[k - 1][1]) & (dist <= BANDS[k][1])] = k
    np.fill_diagonal(band, 0)
    size = np.bincount(pid, minlength=len(prefs))
    chance = np.zeros(len(BANDS))
    for p in range(len(prefs)):
        for q in range(len(prefs)):
            chance[band[p, q]] += size[p] * size[q]
    chance /= chance.sum()

    digits = [re.search(r"\d{7}", r["id"]).group(0) for r in records]
    number = np.array([int(d) for d in digits])
    names = sorted({("C" if r["id"].startswith("C") else "") + d[:4] for r, d in zip(records, digits)})
    batch = np.array([names.index(("C" if r["id"].startswith("C") else "") + d[:4]) for r, d in zip(records, digits)])
    kind = [re.split(r"[，,、(（]", r["name"].strip())[0] for r in records]

    def table(idx, rows):
        seen = Counter(int(band[pid[i], pid[idx[i]]]) for i in rows)
        return {"records": len(rows), "bands": [round(seen[k] / len(rows), 4) for k in range(len(BANDS))],
                "medianKm": round(float(np.median([dist[pid[i], pid[idx[i]]] for i in rows])), 1)}

    out = {"records": n, "leftOut": dropped, "batches": len(names), "bandNames": [b[0] for b in BANDS], "chance": [round(float(c), 4) for c in chance], "runs": {}}
    everyone = list(range(n))
    main_idx = main_score = None
    for label, vectors in raw.items():
        v = centred(vectors)
        for exclusion in ("self", "near", "batch"):
            idx, score = nearest(v, number, batch, exclusion)
            run = {"all": table(idx, everyone), "nearestCosine": {"p10": round(float(np.percentile(score, 10)), 3), "median": round(float(np.median(score)), 3), "p90": round(float(np.percentile(score, 90)), 3)}}
            for t in (0.5, 0.6, 0.7):
                rows = [i for i in everyone if score[i] >= t]
                run[f"cosine>={t}"] = table(idx, rows)
            out["runs"][f"{label}; {exclusion}"] = run
            if label == "names masked" and exclusion == "batch":
                main_idx, main_score = idx, score

    # kinds, on the main run
    by_kind = defaultdict(list)
    for i in everyone:
        by_kind[kind[i]].append(i)
    kinds = []
    for name, rows in by_kind.items():
        if len(rows) < MIN_KIND:
            continue
        b = [band[pid[i], pid[main_idx[i]]] for i in rows]
        top_pref = Counter(records[i]["prefecture"] for i in rows).most_common(1)[0]
        kinds.append({"kind": name, "records": len(rows), "samePrefecture": round(sum(x == 0 for x in b) / len(rows), 3),
                      "beyond200km": round(sum(x >= 3 for x in b) / len(rows), 3), "sameKind": round(sum(kind[main_idx[i]] == name for i in rows) / len(rows), 3),
                      "largestPrefecture": top_pref[0], "largestPrefectureShare": round(top_pref[1] / len(rows), 3)})
    kinds.sort(key=lambda k: -k["beyond200km"])
    out["kindsCounted"] = len(kinds)
    out["kinds"] = kinds
    out["nearestSameKind"] = round(sum(kind[main_idx[i]] == kind[i] for i in everyone) / n, 4)

    # pairs far apart and very alike, as candidates for examples
    far = [i for i in everyone if main_score[i] >= 0.75 and dist[pid[i], pid[main_idx[i]]] > 400]
    far.sort(key=lambda i: -main_score[i])
    out["farExamples"] = [{"cosine": round(float(main_score[i]), 3), "km": round(float(dist[pid[i], pid[main_idx[i]]])),
                           "a": [records[i]["name"], records[i]["prefecture"], records[i]["summary"][:160]],
                           "b": [records[main_idx[i]]["name"], records[main_idx[i]]["prefecture"], records[main_idx[i]]["summary"][:160]]} for i in far[:40]]

    rng = np.random.default_rng(0)
    with (ROOT / "paper/hyakki/validation_pairs.csv").open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(["pair", "cosine", "km", "name_a", "prefecture_a", "summary_a", "name_b", "prefecture_b", "summary_b", "same_tale(1/0)", "related(1/0)"])
        for k, i in enumerate(rng.choice(n, size=100, replace=False)):
            j = main_idx[i]
            w.writerow([k + 1, round(float(main_score[i]), 3), round(float(dist[pid[i], pid[j]])), records[i]["name"], records[i]["prefecture"], records[i]["summary"],
                        records[j]["name"], records[j]["prefecture"], records[j]["summary"], "", ""])

    (ROOT / "paper/hyakki/analysis.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    short = {k: {"all": r["all"], "cosine>=0.6": r["cosine>=0.6"]} for k, r in out["runs"].items()}
    print(json.dumps({"chance": out["chance"], "bandNames": out["bandNames"], "runs": short}, ensure_ascii=False, indent=1))
    for k in kinds[:5] + kinds[-5:]:
        print(k)


if __name__ == "__main__":
    main()

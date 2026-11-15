"""Twins: for each unit, the units in other prefectures that hold a record telling the same account.

The game used to compare units by the mean of their records' vectors, which keeps what the records of one kind
have in common and loses the plot of each. Here records are compared with records. Two records are twins when
  - they were collected in different prefectures,
  - the cosine of their name-masked, mean-removed vectors is at least THRESHOLD (records catalogued in the same
    batch are admitted on the same terms: one survey that lists a legend place by place is evidence that the
    legend is told in those places; the analysis of the paper, which asks a different question, leaves them out), and
  - each is among the other's NEAREST closest records of another prefecture (so that prefectures with many
    records do not become everyone's neighbour).
A unit's twins are the units reached through its records' twins; the pair of records with the highest cosine is
kept, with the first sentence of each to show the player.

Twins joined together form families: the same account as told across the country, a computed index of types.

Reads   data/nichibun/nichibun_enriched.json, data/archive-race/vectors-motif.f32, data/hyakki/units.json,
        public/youkai-gazou-catalog.json
Writes  data/hyakki/twins.json, paper/hyakki/families.json, paper/hyakki/twin_pairs.json
Run     python -X utf8 scripts/hyakki/build_twins.py
"""
import json
import os
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).parent))
sys.path.insert(0, str(ROOT / "scripts" / "archive-race"))
from build_units import keys  # noqa: E402

THRESHOLD = 0.5
SAME_BATCH = 0.5
NEAREST = 15
KEEP = 8          # twins kept per unit
LINE = 30         # characters of the sentence shown


def kinds_of_pictures():
    """Record name -> kind, exactly as build_units.py derives it from the picture catalogue."""
    catalog = [im for im in json.loads((ROOT / "public/youkai-gazou-catalog.json").read_text(encoding="utf-8"))["records"]
               if im["id"].startswith("U426_nichibunken_")]
    stop = {k for line in (Path(__file__).parent / "stop_names.txt").read_text(encoding="utf-8").splitlines()
            if not line.startswith("#") for k in keys(line)}
    by_kind, readings = defaultdict(set), defaultdict(set)
    for im in catalog:
        pairs = [[p.strip() for p in e.split(";") if p.strip()]
                 for e in re.split(r"[,、/・\s]+", re.sub(r"[（(].*?[)）]", "", unicodedata.normalize("NFKC", im["name"])))]
        for pair in (p for p in pairs if p):
            folded = [keys(p)[0] for p in pair if keys(p)]
            if not folded or any(k in stop for k in folded):
                continue
            by_kind[folded[0]].add(im["id"])
            for k in folded[1:]:
                readings[k].add(folded[0])
    kind_of = {k: k for k in by_kind}
    for k, kinds in readings.items():
        if k not in kind_of and len(kinds) == 1:
            kind_of[k] = next(iter(kinds))
    return kind_of


def sentence(record):
    # As written, name and all: by the time it is shown the player has made every choice, and a twin told under
    # another name is part of what there is to find.
    text = unicodedata.normalize("NFKC", record["summary"])
    first = re.split(r"(?<=[。])", text)[0].strip()
    return first if len(first) <= LINE else first[:LINE - 1] + "…"


def main():
    records = json.loads((ROOT / "data/nichibun/nichibun_enriched.json").read_text(encoding="utf-8"))
    units = json.loads((ROOT / "data/hyakki/units.json").read_text(encoding="utf-8"))
    by_key = {u["key"]: u for u in units}
    kind_of = kinds_of_pictures()

    member = {}                       # record index -> unit key
    count = Counter()
    for i, r in enumerate(records):
        if "俗信" in (r["name"] or ""):
            continue
        names = keys(r["name"])
        hit = next((k for k in names + keys(r.get("name_reading")) if k in kind_of), None)
        if not names or not hit:
            continue
        key = f"{kind_of[hit]}|{r['prefecture']}|{r['_admin2'] if r['_geo_level'] == 'municipality' else ''}"
        if key in by_key:
            member[i] = key
            count[key] += 1
    wrong = [k for k, u in by_key.items() if count[k] != u["records"]]
    assert not wrong, f"grouping differs from units.json for {len(wrong)} units, e.g. {wrong[:3]}"
    # Only units the game can show (a tellable story and a silhouette) are paired: a twin nobody can meet is no use.
    texts = json.loads((ROOT / "data/hyakki/texts.json").read_text(encoding="utf-8"))
    drawn = set(os.listdir(ROOT / "data/hyakki/silhouettes"))
    playable = {k for k, u in by_key.items() if texts.get(k, {}).get("suitable") is True and u["image"] + ".png" in drawn}
    member = {i: k for i, k in member.items() if k in playable}

    v = np.fromfile(ROOT / "data/archive-race/vectors-motif.f32", dtype="<f4").reshape(len(records), -1).astype(np.float32)
    v -= v.mean(axis=0)
    v /= np.linalg.norm(v, axis=1, keepdims=True)
    rows = np.array(sorted(member))
    x = v[rows]
    pref = np.array([records[i]["prefecture"] for i in rows])
    digits = [re.search(r"\d{7}", records[i]["id"]).group(0) for i in rows]
    batch = np.array([("C" if records[i]["id"].startswith("C") else "") + d[:4] for i, d in zip(rows, digits)])
    usable = np.array([len(records[i]["summary"]) >= 30 for i in rows])

    sims = x @ x.T
    sims[pref[:, None] == pref[None, :]] = -2
    sims[(batch[:, None] == batch[None, :]) & (sims < SAME_BATCH)] = -2
    sims[~usable, :] = -2
    sims[:, ~usable] = -2
    top = np.argsort(-sims, axis=1)[:, :NEAREST]
    near = [set(t) for t in top]
    pairs = [(a, int(b), float(sims[a, b])) for a in range(len(rows)) for b in top[a] if sims[a, b] >= THRESHOLD and a in near[b] and a < b]

    best = defaultdict(dict)          # unit key -> other unit key -> (score, record a, record b)
    for a, b, s in pairs:
        ka, kb = member[rows[a]], member[rows[b]]
        if ka == kb:
            continue
        for k1, k2, r1, r2 in ((ka, kb, a, b), (kb, ka, b, a)):
            if k2 not in best[k1] or best[k1][k2][0] < s:
                best[k1][k2] = (s, r1, r2)
    twins = {}
    for k, others in best.items():
        ranked = sorted(others.items(), key=lambda kv: -kv[1][0])[:KEEP]
        twins[k] = [{"key": k2, "score": round(s, 3), "mine": sentence(records[rows[r1]]), "theirs": sentence(records[rows[r2]]),
                     "mineId": records[rows[r1]]["id"], "theirsId": records[rows[r2]]["id"]} for k2, (s, r1, r2) in ranked]
    (ROOT / "data/hyakki/twins.json").write_text(json.dumps(twins, ensure_ascii=False), encoding="utf-8")
    # every pair, with the full summaries, for rating by hand (paper/hyakki/make_rating_page.py)
    def card(i):
        r = records[rows[i]]
        return {"id": r["id"], "name": r["name"], "prefecture": r["prefecture"], "summary": r["summary"]}
    listed = [{"score": round(sc, 3), "a": card(a), "b": card(b)} for a, b, sc in sorted(pairs, key=lambda t: (records[rows[t[0]]]["id"], records[rows[t[1]]]["id"]))]
    (ROOT / "paper/hyakki/twin_pairs.json").write_text(json.dumps(listed, ensure_ascii=False), encoding="utf-8")

    # families: twins joined together
    parent = list(range(len(rows)))

    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a
    for a, b, _ in pairs:
        parent[find(a)] = find(b)
    groups = defaultdict(list)
    for a, b, _ in pairs:
        groups[find(a)].extend([a, b])
    families = sorted(({"records": len(set(g)), "prefectures": len({pref[i] for i in set(g)}),
                        "kinds": sorted({member[rows[i]].split("|")[0] for i in set(g)})[:6],
                        "example": sentence(records[rows[sorted(set(g))[0]]])} for g in groups.values()), key=lambda f: (-f["prefectures"], -f["records"]))
    out = {"threshold": THRESHOLD, "recordsCompared": int(len(rows)), "pairs": len(pairs), "recordsWithTwin": len({i for a, b, _ in pairs for i in (a, b)}),
           "unitsCompared": len(playable), "unitsWithTwin": len(twins), "families": len(families),
           "familiesIn3OrMorePrefectures": sum(f["prefectures"] >= 3 for f in families), "largest": families[:25]}
    (ROOT / "paper/hyakki/families.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    print(json.dumps({k: v for k, v in out.items() if k != "largest"}, ensure_ascii=False))
    for f in families[:14]:
        print(f["prefectures"], f["records"], f["kinds"], f["example"])


if __name__ == "__main__":
    main()

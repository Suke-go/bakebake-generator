#!/usr/bin/env python3
"""Checks the built /hyakki data against SPEC v3 (5.1, 5.3, 8.4) and prints samples for review (9).

  python -X utf8 scripts/hyakki/check_units.py
"""

import json
import random
import sys
from pathlib import Path

import numpy as np
from shapely.geometry import Point, shape

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data" / "hyakki"
sys.path.insert(0, str(ROOT / "scripts" / "archive-race"))
from embed_stories import name_terms  # noqa: E402

units = json.loads((OUT / "units.json").read_text(encoding="utf-8"))
texts = json.loads((OUT / "texts.json").read_text(encoding="utf-8"))
town, pref = {}, {}
for f in json.loads((ROOT / "data/geo/gadm41_JPN_2.json").read_text(encoding="utf-8"))["features"]:
    g, p = shape(f["geometry"]), f["properties"]
    town[(p["NL_NAME_1"], p["NL_NAME_2"])] = g
    pref.setdefault(p["NL_NAME_1"], []).append(g)

assert len({u["id"] for u in units}) == len(units), "ids repeat"
for u in units:
    here = Point(u["lon"], u["lat"])
    inside = town[(u["prefecture"], u["place"])].contains(here) if u["place"] else any(g.contains(here) for g in pref[u["prefecture"]])
    assert inside, f"{u['key']} is outside its area"
    assert (OUT / "images" / f"{u['image']}.jpg").exists() and (OUT / "silhouettes" / f"{u['image']}.png").exists(), f"{u['key']} has no picture"
    t = texts.get(u["key"])
    if t and t["suitable"]:
        assert not any(n in t["hint"] for n in name_terms(u["sourceName"]) + name_terms(u["name"])), f"{u['key']} hint names the yokai"

text = np.fromfile(OUT / "text-vectors.f32", dtype="<f4").reshape(len(units), -1)
kinds = json.loads((OUT / "shape-kinds.json").read_text(encoding="utf-8"))
shapes = np.fromfile(OUT / "shape-vectors.f32", dtype="<f4").reshape(len(kinds), -1)
assert np.isfinite(text).all() and np.isfinite(shapes).all()
assert {u["kind"] for u in units} <= set(kinds)

playable = [i for i, u in enumerate(units) if texts.get(u["key"], {}).get("suitable")]
print(json.dumps({"units": len(units), "playable": len(playable),
                  "playablePlace": sum(1 for i in playable if units[i]["place"]),
                  "hintLengthMax": max(len(texts[units[i]["key"]]["hint"]) for i in playable),
                  "descLengthMax": max(len(texts[units[i]["key"]]["desc"]) for i in playable)}))

# For the person who samples similarity (SPEC 9): 20 random units, the 3 nearest by story and by shape.
row = {k: n for n, k in enumerate(kinds)}
rng = random.Random(0)
for i in rng.sample(playable, 20):
    u = units[i]
    by_text = [j for j in np.argsort(-(text[playable] @ text[i])) if playable[j] != i][:3]
    by_shape = [k for k in np.argsort(-(shapes @ shapes[row[u["kind"]]])) if kinds[k] != u["kind"]][:3]
    print(f"{u['name']}({u['prefecture']}) {u['sourceSummary'][:40]}")
    for j in by_text:
        v = units[playable[j]]
        print(f"   話: {v['name']}({v['prefecture']}) {v['sourceSummary'][:40]}")
    print("   形:", "、".join(kinds[k] for k in by_shape))

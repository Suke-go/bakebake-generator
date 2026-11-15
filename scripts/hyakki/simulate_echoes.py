"""How far away are the three records that answer aloud?

Plays the last phase of /hyakki many times with five yōkai drawn at random from one region (distinct kinds), asks
the running server which ninety-five it draws in, and measures, for the three nearest to each of the five (the
ones that display their own line), the distance to the yōkai that drew them in.

Needs the dev server on localhost:3210. Writes paper/hyakki/echoes.json.
Run     python -X utf8 scripts/hyakki/simulate_echoes.py
"""
import json
import math
import os
import random
import urllib.request

import numpy as np
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
API = "http://localhost:3210/api/hyakki"
SESSIONS = 300


def km(a, b):
    lat1, lon1, lat2, lon2 = map(math.radians, (a["lat"], a["lon"], b["lat"], b["lon"]))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(h))


def main():
    units = json.loads((ROOT / "data/hyakki/units.json").read_text(encoding="utf-8"))
    texts = json.loads((ROOT / "data/hyakki/texts.json").read_text(encoding="utf-8"))
    pictures = set(os.listdir(ROOT / "data/hyakki/silhouettes"))
    playable = [u for u in units if texts.get(u["key"], {}).get("suitable") is True and u["image"] + ".png" in pictures]
    by_region = {}
    for u in playable:
        by_region.setdefault(u["region"], []).append(u)
    by_id = {u["id"]: u for u in playable}
    # text similarity as the game computes it: unit vectors, mean over the units in play removed, cosine
    rows = [i for i, u in enumerate(units) if u["id"] in by_id]
    v = np.fromfile(ROOT / "data/hyakki/text-vectors.f32", dtype="<f4").reshape(len(units), -1)[rows]
    v = v - v.mean(axis=0)
    v /= np.linalg.norm(v, axis=1, keepdims=True)
    row = {units[i]["id"]: k for k, i in enumerate(rows)}

    rng = random.Random(0)
    aloud, everyone = [], []
    for _ in range(SESSIONS):
        pool = by_region[rng.choice(sorted(by_region))]
        chosen, kinds = [], set()
        while len(chosen) < 5:
            u = rng.choice(pool)
            if u["kind"] not in kinds:
                chosen.append(u)
                kinds.add(u["kind"])
        body = json.dumps({"action": "summon", "chosen": [u["id"] for u in chosen]}).encode()
        lights = json.load(urllib.request.urlopen(urllib.request.Request(API, body, {"Content-Type": "application/json"}), timeout=120))["lights"]
        for light in lights:
            d = km(light, chosen[light["caller"]])
            same = by_id[light["id"]]["prefecture"] == chosen[light["caller"]]["prefecture"]
            cos = float(v[row[light["id"]]] @ v[row[chosen[light["caller"]]["id"]]])
            everyone.append((d, same, cos))
            if light["tease"]:
                aloud.append((d, same, cos))

    def summary(rows):
        ds = sorted(d for d, _, _ in rows)
        cs = sorted(c for _, _, c in rows)
        far = [c for d, _, c in rows if d > 200]
        return {"count": len(rows), "textCosineMedian": round(cs[len(cs) // 2], 3), "textCosine>=0.5": round(sum(c >= 0.5 for c in cs) / len(cs), 3),
                "textCosine>=0.6": round(sum(c >= 0.6 for c in cs) / len(cs), 3), "over200kmAndCosine>=0.5": round(sum(c >= 0.5 for c in far) / len(rows), 3),
                "samePrefecture": round(sum(s for _, s, _ in rows) / len(rows), 3), "over200km": round(sum(d > 200 for d in ds) / len(ds), 3),
                "over400km": round(sum(d > 400 for d in ds) / len(ds), 3), "medianKm": round(ds[len(ds) // 2])}

    out = {"sessions": SESSIONS, "answeringAloud": summary(aloud), "allDrawnIn": summary(everyone)}
    (ROOT / "paper/hyakki/echoes.json").write_text(json.dumps(out, indent=1), encoding="utf-8")
    print(json.dumps(out, indent=1))


if __name__ == "__main__":
    main()

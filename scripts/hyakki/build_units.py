#!/usr/bin/env python3
"""Builds the yokai units for /hyakki (SPEC v3, 5 and 10/M1).

A unit is the folklore records that share a name kind and a place. A kind is a
set of spellings that the image archive files under the same pictures (狐 and
キツネ), so a unit always has a picture. Units without one are not candidates.

Inputs are read only. Outputs go to data/hyakki/ (server side, never public):
  units.json         one entry per unit: random id, place, picture, records
  text-vectors.f32   mean motif vector per unit, unit order, unit length
  kinds.json         kind -> pictures used for its shape vector
  report.json        the counts M1 has to report

Run: python -X utf8 scripts/hyakki/build_units.py
"""

from __future__ import annotations

import hashlib
import json
import random
import re
import secrets
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np
from shapely.geometry import Point, shape
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data" / "hyakki"
REGIONS = {"hokkaido": "hokkaido-tohoku", "tohoku": "hokkaido-tohoku", "kanto": "kanto", "chubu": "chubu",
           "kinki": "kinki", "chugoku": "chugoku-shikoku", "shikoku": "chugoku-shikoku", "kyushu": "kyushu-okinawa"}
# First-pass word list for stories not shown to children; a person samples the result (SPEC 9).
UNSUITABLE = re.compile("殺|死体|死骸|首を吊|首吊|自殺|心中|強姦|犯さ|犯し|姦|妊|堕胎|間引|子を産|流産|血まみれ|生首|人を食|食い殺|喰い殺|"
                        "人肉|性器|陰部|男根|遊女|女郎|癩|らい病|狂人|気が狂|発狂|部落|差別|祟り殺")
SHAPE_IMAGES = 20  # shortcut: a kind's shape vector averages at most this many pictures (鬼 has 905), raise if shapes look noisy
FAR_DEGREES = 1.5  # prefecture-only units stay near the prefecture's largest land part (not 小笠原 for 東京都)


def keys(text: str | None) -> list[str]:
    """Spellings a name is filed under; mirrors yokaiNameKeys in src/lib/yokai-image-links.ts, kana folded."""
    s = re.sub(r"[（(].*?[)）]", "", unicodedata.normalize("NFKC", text or ""))
    parts = [p.strip() for p in re.split(r"[,、;/・\s]+", s)]
    return ["".join(chr(ord(c) + 0x60) if "ぁ" <= c <= "ゖ" else c for c in p) for p in parts if p]


def scatter(area, seed: str) -> tuple[float, float]:
    """A point inside the area, the same one every run for the same seed."""
    rng = random.Random(hashlib.sha256(seed.encode()).digest())
    west, south, east, north = area.bounds
    while True:
        p = Point(rng.uniform(west, east), rng.uniform(south, north))
        if area.contains(p):
            return round(p.y, 5), round(p.x, 5)


def main() -> None:
    records = json.loads((ROOT / "data/nichibun/nichibun_enriched.json").read_text(encoding="utf-8"))
    # Only pictures Nichibun holds: its permission covers those, and it does not serve the overseas museums' files.
    catalog = [im for im in json.loads((ROOT / "public/youkai-gazou-catalog.json").read_text(encoding="utf-8"))["records"]
               if im["id"].startswith("U426_nichibunken_")]
    image_pref = {f["properties"]["id"]: f["properties"].get("prefecture")
                  for f in json.loads((ROOT / "public/youkai-gazou-geo.json").read_text(encoding="utf-8"))["features"]}
    stop = {k for line in (Path(__file__).parent / "stop_names.txt").read_text(encoding="utf-8").splitlines()
            if not line.startswith("#") for k in keys(line)}

    # Kinds: the archive files a picture under "漢字;読み" pairs. The first spelling is the kind;
    # a reading leads to it only when no other kind shares that reading (クモ: 蜘蛛 or 雲).
    by_kind: dict[str, set[str]] = defaultdict(set)
    label: dict[str, str] = {}
    readings: dict[str, set[str]] = defaultdict(set)
    names_on: dict[str, int] = {}
    for im in catalog:
        pairs = [[p.strip() for p in e.split(";") if p.strip()]
                 for e in re.split(r"[,、/・\s]+", re.sub(r"[（(].*?[)）]", "", unicodedata.normalize("NFKC", im["name"])))]
        pairs = [p for p in pairs if p]
        names_on[im["id"]] = len(pairs)
        for pair in pairs:
            folded = [keys(p)[0] for p in pair if keys(p)]
            if not folded or any(k in stop for k in folded):
                continue
            by_kind[folded[0]].add(im["id"])
            label.setdefault(folded[0], pair[0])
            for k in folded[1:]:
                readings[k].add(folded[0])
    kind_of = {k: k for k in by_kind}
    for k, kinds in readings.items():
        if k not in kind_of and len(kinds) == 1:
            kind_of[k] = next(iter(kinds))
    images = {im["id"]: im for im in catalog}

    pref_region = {}
    groups: dict[tuple, list[dict]] = defaultdict(list)
    spelled: dict[tuple, Counter] = defaultdict(Counter)
    skipped = Counter()
    for r in records:
        pref_region[r["prefecture"]] = REGIONS[r["region"]]
        if "俗信" in (r["name"] or ""):   # a superstition filed under its topic word, not a creature
            skipped["superstition"] += 1
            continue
        names = keys(r["name"])
        hit = next((k for k in names + keys(r.get("name_reading")) if k in kind_of), None)
        if not names or not hit:
            skipped["no_picture"] += 1
            continue
        place = r["_admin2"] if r["_geo_level"] == "municipality" else ""
        unit = (kind_of[hit], r["prefecture"], place)
        groups[unit].append(r)
        # Shown under the spelling the records use; a reading-only match shows the kind's spelling.
        spelled[unit][next((raw for raw, k in zip(_raw(r["name"]), names) if kind_of.get(k) == unit[0]), label[unit[0]])] += 1

    gadm = json.loads((ROOT / "data/geo/gadm41_JPN_2.json").read_text(encoding="utf-8"))["features"]
    town, parts = {}, defaultdict(list)
    for f in gadm:
        g = shape(f["geometry"])
        town[(f["properties"]["NL_NAME_1"], f["properties"]["NL_NAME_2"])] = g
        parts[f["properties"]["NL_NAME_1"]].append(g)
    land = {}
    for pref, gs in parts.items():
        whole = unary_union(gs)
        pieces = list(getattr(whole, "geoms", [whole]))
        main_part = max(pieces, key=lambda p: p.area).centroid
        land[pref] = unary_union([p for p in pieces if p.centroid.distance(main_part) < FAR_DEGREES])

    order = [r["id"] for r in json.loads((ROOT / "data/experience-search/records.json").read_text(encoding="utf-8"))]
    row = {rid: i for i, rid in enumerate(order)}
    motif = np.fromfile(ROOT / "data/archive-race/vectors-motif.f32", dtype="<f4").reshape(len(order), -1)

    units, vectors, used = [], [], set()
    kind_images: dict[str, list[str]] = {}
    dropped = Counter()
    for (kind, pref, place), rs in sorted(groups.items()):
        clean = [r for r in rs if not UNSUITABLE.search(r["summary"] or "") and r.get("summary")]
        if not clean:
            dropped["no_suitable_story"] += 1
            continue
        if pref not in land or (place and (pref, place) not in town):
            dropped["no_polygon"] += 1
            continue
        stable = f"{kind}|{pref}|{place}"
        pool = sorted(by_kind[kind])
        kind_images.setdefault(kind, sorted(pool, key=lambda i: (names_on[i], i))[:SHAPE_IMAGES])
        region = pref_region[pref]
        # Same prefecture, then same region, then the picture filed under the fewest other names.
        picture = min(pool, key=lambda i: (image_pref.get(i) != pref, pref_region.get(image_pref.get(i)) != region, names_on[i], i))
        lat, lon = scatter(town[(pref, place)] if place else land[pref], stable)
        uid = secrets.token_urlsafe(6)
        while uid in used:
            uid = secrets.token_urlsafe(6)
        used.add(uid)
        source = max(clean, key=lambda r: len(r["summary"]))
        units.append({
            "id": uid, "key": stable, "kind": kind, "name": spelled[(kind, pref, place)].most_common(1)[0][0],
            "prefecture": pref, "region": region, "place": place or None, "lat": lat, "lon": lon,
            "records": len(rs), "sourceRecord": source["id"], "sourceName": source["name"], "sourceSummary": source["summary"],
            "image": picture, "imageUrl": images[picture]["imageUrl"], "imageSourceUrl": images[picture]["sourceUrl"],
        })
        v = motif[[row[r["id"]] for r in rs]].mean(axis=0)
        vectors.append(v / np.linalg.norm(v))

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "units.json").write_text(json.dumps(units, ensure_ascii=False), encoding="utf-8")
    np.asarray(vectors, dtype="<f4").tofile(OUT / "text-vectors.f32")
    (OUT / "kinds.json").write_text(json.dumps(kind_images, ensure_ascii=False), encoding="utf-8")

    by_region = defaultdict(lambda: {"place": 0, "prefecture": 0})
    for u in units:
        by_region[u["region"]]["place" if u["place"] else "prefecture"] += 1
    per_picture = Counter(u["image"] for u in units)
    per_pref_names = Counter()
    for kind, pref in {(u["kind"], u["prefecture"]) for u in units}:
        per_pref_names[pref] += 1
    report = {
        "units": len(units), "kinds": len({u["kind"] for u in units}), "byRegion": by_region,
        "recordsSkipped": skipped, "unitsDropped": dropped,
        "picturesShown": len(per_picture), "unitsPerPicture": {"max": max(per_picture.values()), "median": int(np.median(list(per_picture.values())))},
        "picturesForShape": len({i for ids in kind_images.values() for i in ids} | set(per_picture)),
        "fewestKindsInAPrefecture": per_pref_names.most_common()[-3:],
        "prefecturesWithoutPlaceUnits": sorted(set(pref_region) - {u["prefecture"] for u in units if u["place"]}),
    }
    (OUT / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=1))


def _raw(name: str) -> list[str]:
    """The name's spellings as written, in the same order as keys()."""
    s = re.sub(r"[（(].*?[)）]", "", unicodedata.normalize("NFKC", name or ""))
    return [p.strip() for p in re.split(r"[,、;/・\s]+", s) if p.strip()]


if __name__ == "__main__":
    main()

"""Build public/hyakki/japan.json: prefecture outlines (with their region) and the camera frames.

Usage (from the repo root):  PYTHONUTF8=1 python scripts/hyakki/build_map.py

The viewer (public/hyakki-view/) uses it for the region tints, for "which region did the finger land in" and
for "is this land" (scripts/hyakki/check_geo.ts asserts that). Coordinates are lon/lat degrees; the background
comes from GSI tiles at run time, so nothing else is generated here.
"""
from __future__ import annotations

import json
from pathlib import Path

from shapely.geometry import MultiPolygon, Polygon
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "data" / "geo" / "gadm41_JPN_2.json"
OUT = ROOT / "public" / "hyakki" / "japan.json"

SIMPLIFY_DEG = 0.004  # about 400 m: the map can be zoomed in to a town, so the coast stays fairly true
MIN_PART_AREA = 0.0003  # deg^2, about 3 km^2: smaller islets are dropped
FRAME_MIN_AREA = 0.02  # deg^2: islands smaller than this do not decide the camera frame
JAPAN_BOX = (122.6, 146.2, 24.0, 45.7)  # lon0, lon1, lat0, lat1; Ogasawara and the northern islands stay out

REGIONS = {
    "hokkaido-tohoku": ["北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県"],
    "kanto": ["茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県"],
    "chubu": ["新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県", "静岡県", "愛知県"],
    "kinki": ["三重県", "滋賀県", "京都府", "大阪府", "兵庫県", "奈良県", "和歌山県"],
    "chugoku-shikoku": ["鳥取県", "島根県", "岡山県", "広島県", "山口県", "徳島県", "香川県", "愛媛県", "高知県"],
    "kyushu-okinawa": ["福岡県", "佐賀県", "長崎県", "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県"],
}
PREF_REGION = {p: r for r, ps in REGIONS.items() for p in ps}


def keep_part(poly: Polygon) -> bool:
    p = poly.representative_point()
    if not (JAPAN_BOX[0] <= p.x <= JAPAN_BOX[1] and JAPAN_BOX[2] <= p.y <= JAPAN_BOX[3]):
        return False
    if p.y < 30.5 and p.x > 131.0:  # Ogasawara, Daito: too far for any view
        return False
    return poly.area >= MIN_PART_AREA


def ring_json(ring):
    out = []
    for lon, lat in list(ring.coords)[:-1]:
        out.append(round(lon, 3))
        out.append(round(lat, 3))
    return out


def main():
    import geopandas as gpd

    g = gpd.read_file(SRC, encoding="utf-8")
    missing = set(PREF_REGION) - set(g["NL_NAME_1"].unique())
    extra = set(g["NL_NAME_1"].unique()) - set(PREF_REGION)
    assert not missing and not extra, (missing, extra)
    prefs = []
    for name, grp in g.groupby("NL_NAME_1"):
        merged = unary_union(list(grp.geometry.buffer(0)))
        polys = []
        for part in (merged.geoms if isinstance(merged, MultiPolygon) else [merged]):
            if not keep_part(part):
                continue
            s = part.simplify(SIMPLIFY_DEG, preserve_topology=True)
            for sp in (s.geoms if isinstance(s, MultiPolygon) else [s]):
                if sp.is_empty or sp.area < MIN_PART_AREA * 0.5:
                    continue
                holes = [h for h in sp.interiors if Polygon(h).area >= MIN_PART_AREA]
                polys.append(Polygon(sp.exterior, holes))
        prefs.append((name, PREF_REGION[name], polys))

    # Camera frames: the mainland, not far islets, so a region fills the screen.
    frames = {"japan": list(JAPAN_BOX)}
    for r in REGIONS:
        big = [p for _, rr, ps in prefs if rr == r for p in ps if p.area >= FRAME_MIN_AREA]
        x0, y0, x1, y1 = zip(*[p.bounds for p in big])
        frames[r] = [round(min(x0) - 0.25, 2), round(max(x1) + 0.25, 2), round(min(y0) - 0.25, 2), round(max(y1) + 0.25, 2)]

    meta = {
        "frames": frames,
        "prefectures": [
            {"name": n, "region": r, "polys": [[ring_json(p.exterior)] + [ring_json(h) for h in p.interiors] for p in ps]}
            for n, r, ps in prefs
        ],
    }
    OUT.write_text(json.dumps(meta, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{OUT.name} {OUT.stat().st_size / 1024:.0f} KB, {sum(len(ps) for _, _, ps in prefs)} polygons")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Small copies of the shown pictures (data/hyakki/thumbs/, longest side 360 px): the app shows them at 44-160 px,
and the originals average 108 KB. Run after fetch_images.py: python -X utf8 scripts/hyakki/build_thumbs.py"""
import json
from pathlib import Path

from PIL import Image

OUT = Path(__file__).resolve().parents[2] / "data" / "hyakki"
(OUT / "thumbs").mkdir(exist_ok=True)
done = 0
for image in sorted({u["image"] for u in json.loads((OUT / "units.json").read_text(encoding="utf-8"))}):
    src = OUT / "images" / f"{image}.jpg"
    if not src.exists():
        continue
    im = Image.open(src).convert("RGB")
    im.thumbnail((360, 360))
    im.save(OUT / "thumbs" / f"{image}.jpg", quality=82)
    done += 1
print(done, "thumbs", sum(p.stat().st_size for p in (OUT / "thumbs").glob("*.jpg")) // 1024, "KB")

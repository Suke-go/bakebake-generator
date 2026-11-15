#!/usr/bin/env python3
"""Downloads the pictures /hyakki shows or uses for shape vectors into data/hyakki/images/.

Sequential, at least 1.2 s apart (same pace as map_image_archive.py), resumable.
Stops after five failures. Run after build_units.py:
  python -X utf8 scripts/hyakki/fetch_images.py
"""
import json
import sys
import time
from pathlib import Path

import requests

OUT = Path(__file__).resolve().parents[2] / "data" / "hyakki"
units = json.loads((OUT / "units.json").read_text(encoding="utf-8"))
wanted = {u["image"] for u in units} | {i for ids in json.loads((OUT / "kinds.json").read_text(encoding="utf-8")).values() for i in ids}
(OUT / "images").mkdir(exist_ok=True)
failures = 0
for n, image in enumerate(sorted(wanted)):
    target = OUT / "images" / f"{image}.jpg"
    if target.exists():
        continue
    try:
        r = requests.get(f"https://www.nichibun.ac.jp/YoukaiGazou/image/{image}.jpg", timeout=30,
                         headers={"User-Agent": "BakebakeHyakki/1.0 (research; sequential requests)"})
        r.raise_for_status()
        target.write_bytes(r.content)
    except Exception as error:
        failures += 1
        print("failed", image, error, flush=True)
        if failures >= 5:
            sys.exit("five failures; stopped")
    if n % 100 == 0:
        print(n, "of", len(wanted), flush=True)
    time.sleep(1.2)
print("done", len(list((OUT / "images").glob("*.jpg"))), "of", len(wanted), "failures", failures)

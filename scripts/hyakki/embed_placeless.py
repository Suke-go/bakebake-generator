"""Embeds every record's summary with the yōkai's name and every place name masked.

A robustness check for scripts/hyakki/analyze_geography.py: if the most similar account is often from the same
prefecture only because both summaries name the same places, the effect should shrink when place names are gone.
Names are masked as in scripts/archive-race/embed_stories.py (motif mode). Places masked: the record's prefecture
and municipality, the place mentions found by the geocoding step, and any word ending in a place suffix.

Writes  data/hyakki/analysis/vectors-placeless.f32 (float32, unit length, rows in nichibun_enriched.json order)
Run     python -X utf8 scripts/hyakki/embed_placeless.py
"""
import ast
import json
import re
import sys
import unicodedata
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts" / "archive-race"))
from embed_stories import MODEL, REVISION, mask_names  # noqa: E402

PLACE = "ある所"
SUFFIX = re.compile(r"[一-龥々ヶケノ之]{1,6}(?:県|郡|市|町|村|島|藩|国|郷|庄|浦|峠|岳|嶽)")


def mask_places(text: str, record: dict) -> str:
    terms = {record.get("prefecture") or "", (record.get("prefecture") or "")[:-1], record.get("_admin2") or ""}
    try:
        terms.update(ast.literal_eval(record.get("_place_mentions") or "[]"))
    except (ValueError, SyntaxError):
        pass
    terms = sorted((unicodedata.normalize("NFKC", t) for t in terms if len(t) >= 2), key=len, reverse=True)
    if terms:
        text = re.sub("|".join(re.escape(t) for t in terms), PLACE, text)
    text = SUFFIX.sub(PLACE, text)
    return re.sub(f"(?:{PLACE})+", PLACE, text)


def main():
    from sentence_transformers import SentenceTransformer

    records = json.loads((ROOT / "data/nichibun/nichibun_enriched.json").read_text(encoding="utf-8"))
    texts = [mask_places(mask_names(r["summary"], r["name"])[0], r) for r in records]
    changed = sum(PLACE in t for t in texts)
    print(f"{len(texts)} records, {changed} with a place masked", flush=True)
    model = SentenceTransformer(MODEL, revision=REVISION, device="cpu")
    x = model.encode(["query: " + t for t in texts], batch_size=64, normalize_embeddings=True, show_progress_bar=False, convert_to_numpy=True).astype("<f4")
    out = ROOT / "data/hyakki/analysis"
    out.mkdir(parents=True, exist_ok=True)
    x.tofile(out / "vectors-placeless.f32")
    (out / "vectors-placeless.json").write_text(json.dumps({"model": MODEL, "revision": REVISION, "count": len(texts), "recordsWithPlaceMasked": changed}), encoding="utf-8")
    print("done", flush=True)


if __name__ == "__main__":
    main()

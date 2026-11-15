#!/usr/bin/env python3
"""Shape vectors and silhouettes from the downloaded pictures (SPEC v3, 5.2 and 5.4).

  shape-vectors.f32   one CLIP image vector per kind (mean over its pictures, unit length)
  shape-kinds.json    the kinds in row order
  silhouettes/<picture>.png   the shown picture's largest figure, filled black

Run after fetch_images.py: python -X utf8 scripts/hyakki/build_shapes.py
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

OUT = Path(__file__).resolve().parents[2] / "data" / "hyakki"
SIZE = 256


def silhouette(im: Image.Image) -> Image.Image:
    """Black where the picture differs from its paper colour, keeping only the largest connected
    figure: captions written beside the figure (often its name) are separate strokes and drop out.
    shortcut: a page printed edge to edge comes out as one block; replace with hand-cut masks if that matters."""
    im = im.convert("RGB")
    im.thumbnail((SIZE, SIZE))
    a = np.asarray(im, dtype=np.float32)
    border = np.concatenate([a[0], a[-1], a[:, 0], a[:, -1]])
    far = np.linalg.norm(a - np.median(border, axis=0), axis=2)
    mask = ndimage.binary_closing(far > max(40.0, far.mean() + far.std() / 2), iterations=3)
    mask = ndimage.binary_fill_holes(mask)
    labels, count = ndimage.label(mask)
    if count:
        mask = labels == 1 + int(np.argmax(ndimage.sum(mask, labels, range(1, count + 1))))
    rgba = np.zeros((*mask.shape, 4), dtype=np.uint8)
    rgba[..., 3] = mask * 255
    return Image.fromarray(rgba)


def main() -> None:
    from sentence_transformers import SentenceTransformer

    units = json.loads((OUT / "units.json").read_text(encoding="utf-8"))
    kinds = json.loads((OUT / "kinds.json").read_text(encoding="utf-8"))
    # A picture that could not be downloaded is skipped; the app leaves out the units that show it.
    have = {p.stem for p in (OUT / "images").glob("*.jpg")}
    kinds = {k: [i for i in ids if i in have] for k, ids in kinds.items()}
    kinds = {k: ids for k, ids in kinds.items() if ids}
    shown = sorted({u["image"] for u in units} & have)
    (OUT / "silhouettes").mkdir(exist_ok=True)
    for image in shown:
        silhouette(Image.open(OUT / "images" / f"{image}.jpg")).save(OUT / "silhouettes" / f"{image}.png")

    model = SentenceTransformer("clip-ViT-B-32", device="cpu")
    wanted = sorted({i for ids in kinds.values() for i in ids})
    vectors = model.encode([Image.open(OUT / "images" / f"{i}.jpg").convert("RGB") for i in wanted],
                           batch_size=32, normalize_embeddings=True, show_progress_bar=True)
    row = {i: n for n, i in enumerate(wanted)}
    names = sorted(kinds)
    means = np.stack([vectors[[row[i] for i in kinds[k]]].mean(axis=0) for k in names])
    means /= np.linalg.norm(means, axis=1, keepdims=True)
    assert np.isfinite(means).all()
    means.astype("<f4").tofile(OUT / "shape-vectors.f32")
    (OUT / "shape-kinds.json").write_text(json.dumps(names, ensure_ascii=False), encoding="utf-8")
    print(json.dumps({"silhouettes": len(shown), "picturesEmbedded": len(wanted), "kinds": len(names), "dimensions": int(means.shape[1])}))


if __name__ == "__main__":
    main()

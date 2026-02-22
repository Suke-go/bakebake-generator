"""
Export trained projection weights and pre-projected embeddings.

Binary outputs (Float32 little-endian):
    data/analysis/projection-matrix.bin     — 384×768 floats (1.13 MB)
    data/analysis/projected-vectors.bin     — 1037×384 floats (1.59 MB)

JSON metadata output:
    data/analysis/projected-meta.json       — entry metadata (id, name, summary, location, source)
    data/analysis/projection-matrix.json    — kept for JSON fallback
    data/analysis/projected-embeddings.json — kept for JSON fallback
"""

import json
import struct
from pathlib import Path
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"
ANALYSIS = DATA / "analysis"

EMBEDDINGS_FILE = DATA / "folklore-embeddings.json"
WEIGHTS_FILE = ANALYSIS / "projection_weights.pt"

# Binary outputs
MATRIX_BIN = ANALYSIS / "projection-matrix.bin"
VECTORS_BIN = ANALYSIS / "projected-vectors.bin"
META_JSON = ANALYSIS / "projected-meta.json"

# JSON outputs (fallback)
MATRIX_JSON = ANALYSIS / "projection-matrix.json"
PROJECTED_JSON = ANALYSIS / "projected-embeddings.json"


class AspectProjection(nn.Module):
    def __init__(self, input_dim, num_axes, subspace_dim):
        super().__init__()
        self.num_axes = num_axes
        self.subspace_dim = subspace_dim
        self.projection = nn.Linear(input_dim, num_axes * subspace_dim, bias=False)

    def forward(self, x):
        proj = self.projection(x)
        return [F.normalize(proj[:, i*self.subspace_dim:(i+1)*self.subspace_dim], dim=-1)
                for i in range(self.num_axes)]


def main():
    checkpoint = torch.load(WEIGHTS_FILE, map_location="cpu", weights_only=False)
    config = checkpoint["config"]
    model = AspectProjection(config["input_dim"], config["num_axes"], config["subspace_dim"])
    model.load_state_dict(checkpoint["model_state_dict"])
    model.eval()

    weight = model.projection.weight.detach().numpy()  # (384, 768)
    print(f"Projection matrix shape: {weight.shape}")

    # ── Binary: projection matrix ─────────────────────────────────
    # Header: rows(u32) + cols(u32) + subspaceDim(u32) + numAxes(u32)
    rows, cols = weight.shape
    with open(MATRIX_BIN, "wb") as f:
        f.write(struct.pack("<IIII", rows, cols, config["subspace_dim"], config["num_axes"]))
        f.write(weight.astype(np.float32).tobytes())
    print(f"Binary projection matrix: {MATRIX_BIN} ({MATRIX_BIN.stat().st_size / 1024:.0f} KB)")

    # ── JSON fallback: projection matrix ──────────────────────────
    matrix_data = {
        "matrix": weight.tolist(),
        "axes": config["axis_names"],
        "subspaceDim": config["subspace_dim"],
        "inputDim": config["input_dim"],
        "projDim": config["num_axes"] * config["subspace_dim"],
    }
    with open(MATRIX_JSON, "w", encoding="utf-8") as f:
        json.dump(matrix_data, f)
    print(f"JSON projection matrix: {MATRIX_JSON} ({MATRIX_JSON.stat().st_size / 1024 / 1024:.2f} MB)")

    # ── Project all embeddings ────────────────────────────────────
    with open(EMBEDDINGS_FILE, "r", encoding="utf-8") as f:
        emb_data = json.load(f)
    entries = emb_data["entries"]
    print(f"\nProjecting {len(entries)} embeddings...")

    embeddings = np.array([e["embedding"] for e in entries], dtype=np.float32)
    with torch.no_grad():
        x = torch.tensor(embeddings)
        subspaces = model(x)  # list of (N, 128) tensors

    # Stack all subspaces: (N, 384) = [topic(128) | location(128) | phenomenon(128)]
    all_vectors = torch.cat(subspaces, dim=1).numpy()  # (N, 384)

    # ── Binary: projected vectors ─────────────────────────────────
    # Header: numEntries(u32) + vectorDim(u32)
    n_entries, vec_dim = all_vectors.shape
    with open(VECTORS_BIN, "wb") as f:
        f.write(struct.pack("<II", n_entries, vec_dim))
        f.write(all_vectors.astype(np.float32).tobytes())
    print(f"Binary projected vectors: {VECTORS_BIN} ({VECTORS_BIN.stat().st_size / 1024:.0f} KB)")

    # ── JSON: metadata ────────────────────────────────────────────
    meta_entries = []
    for entry in entries:
        meta_entries.append({
            "id": entry["id"],
            "name": entry["name"],
            "summary": entry.get("summary", ""),
            "location": entry.get("location", ""),
            "source": entry.get("source", ""),
        })

    meta_data = {
        "axes": config["axis_names"],
        "subspaceDim": config["subspace_dim"],
        "numEntries": n_entries,
        "vectorDim": vec_dim,
        "entries": meta_entries,
    }
    with open(META_JSON, "w", encoding="utf-8") as f:
        json.dump(meta_data, f, ensure_ascii=False)
    print(f"Metadata JSON: {META_JSON} ({META_JSON.stat().st_size / 1024:.0f} KB)")

    # ── JSON fallback: projected embeddings ───────────────────────
    axis_names = config["axis_names"]
    field_names = {"location": "location_v"}
    projected_entries = []
    for i, entry in enumerate(entries):
        proj_entry = {
            "id": entry["id"],
            "name": entry["name"],
            "summary": entry.get("summary", ""),
            "location": entry.get("location", ""),
            "source": entry.get("source", ""),
        }
        for ax_idx, ax_name in enumerate(axis_names):
            field = field_names.get(ax_name, ax_name)
            proj_entry[field] = [round(float(v), 6) for v in subspaces[ax_idx][i]]
        projected_entries.append(proj_entry)

    projected_data = {
        "axes": axis_names,
        "subspaceDim": config["subspace_dim"],
        "entries": projected_entries,
    }
    with open(PROJECTED_JSON, "w", encoding="utf-8") as f:
        json.dump(projected_data, f)
    print(f"JSON projected embeddings: {PROJECTED_JSON} ({PROJECTED_JSON.stat().st_size / 1024 / 1024:.2f} MB)")

    # ── Summary ───────────────────────────────────────────────────
    bin_total = MATRIX_BIN.stat().st_size + VECTORS_BIN.stat().st_size + META_JSON.stat().st_size
    json_total = MATRIX_JSON.stat().st_size + PROJECTED_JSON.stat().st_size
    print(f"\n=== Size comparison ===")
    print(f"  Binary (matrix + vectors + meta): {bin_total / 1024 / 1024:.2f} MB")
    print(f"  JSON (matrix + projected):        {json_total / 1024 / 1024:.2f} MB")
    print(f"  Reduction: {(1 - bin_total / json_total) * 100:.0f}%")


if __name__ == "__main__":
    main()

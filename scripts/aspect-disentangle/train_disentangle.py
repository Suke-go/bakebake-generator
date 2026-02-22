"""
Train 3-axis aspect-disentangled linear projection via contrastive learning.

Architecture:
    768d Gemini embedding (frozen)
    → Linear(768, 384)
    → Split: topic (128d) + location (128d) + phenomenon (128d)

Losses:
    L_topic      = InfoNCE on topic_subspace      (same-cluster = positive)
    L_location   = InfoNCE on location_subspace    (same-region  = positive)
    L_phenomenon = InfoNCE on phenomenon_subspace  (same-phenomenon = positive)
    L_orthog     = pairwise Frobenius norm of cross-correlations
    Total        = L_topic + L_location + L_phenomenon + λ · L_orthog

Usage:
    python train_disentangle.py [--epochs 100] [--lr 1e-3] [--lambda-orthog 0.1]
"""

import argparse
import json
import random
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import DataLoader, Dataset

# ── paths ──────────────────────────────────────────────────────────────
ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"
ANALYSIS = DATA / "analysis"

EMBEDDINGS_FILE = DATA / "folklore-embeddings.json"
PAIRS_FILE = ANALYSIS / "contrastive-pairs.json"
OUTPUT_WEIGHTS = ANALYSIS / "projection_weights.pt"
OUTPUT_LOG = ANALYSIS / "training_log.json"

# ── hyperparameters ────────────────────────────────────────────────────
EMBED_DIM = 768
NUM_AXES = 3
SUBSPACE_DIM = 128
PROJ_DIM = NUM_AXES * SUBSPACE_DIM  # 384
TEMPERATURE = 0.07
BATCH_SIZE = 128
SEED = 42


class AspectProjection(nn.Module):
    """Linear projection splitting embedding into K aspect subspaces."""

    def __init__(self, input_dim: int = EMBED_DIM, num_axes: int = NUM_AXES,
                 subspace_dim: int = SUBSPACE_DIM):
        super().__init__()
        self.num_axes = num_axes
        self.subspace_dim = subspace_dim
        proj_dim = num_axes * subspace_dim
        self.projection = nn.Linear(input_dim, proj_dim, bias=False)

    def forward(self, x: torch.Tensor) -> list[torch.Tensor]:
        proj = self.projection(x)  # (B, num_axes * subspace_dim)
        subspaces = []
        for i in range(self.num_axes):
            start = i * self.subspace_dim
            end = (i + 1) * self.subspace_dim
            subspaces.append(F.normalize(proj[:, start:end], dim=-1))
        return subspaces  # [topic, location, phenomenon]

    def get_full_projection(self, x: torch.Tensor):
        return F.normalize(self.projection(x), dim=-1)


class ContrastivePairDataset(Dataset):
    def __init__(self, pairs: list, embeddings: dict[str, np.ndarray]):
        self.data = []
        for a_id, b_id in pairs:
            if a_id in embeddings and b_id in embeddings:
                self.data.append((embeddings[a_id], embeddings[b_id]))

    def __len__(self):
        return len(self.data)

    def __getitem__(self, idx):
        a_emb, b_emb = self.data[idx]
        return torch.tensor(a_emb, dtype=torch.float32), \
               torch.tensor(b_emb, dtype=torch.float32)


def info_nce_loss(anchor: torch.Tensor, positive: torch.Tensor,
                  temperature: float = TEMPERATURE) -> torch.Tensor:
    B = anchor.size(0)
    if B < 2:
        return torch.tensor(0.0, device=anchor.device)
    logits = torch.mm(anchor, positive.T) / temperature
    labels = torch.arange(B, device=anchor.device)
    return F.cross_entropy(logits, labels)


def pairwise_orthogonality_loss(subspaces: list[torch.Tensor]) -> torch.Tensor:
    """Penalize correlation between ALL pairs of subspaces."""
    loss = torch.tensor(0.0, device=subspaces[0].device)
    B = subspaces[0].size(0)
    if B < 2:
        return loss
    count = 0
    for i in range(len(subspaces)):
        for j in range(i + 1, len(subspaces)):
            cross_corr = torch.mm(subspaces[i].T, subspaces[j]) / B
            loss = loss + torch.norm(cross_corr, p="fro")
            count += 1
    return loss / max(count, 1)


def load_embeddings() -> dict[str, np.ndarray]:
    with open(EMBEDDINGS_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)
    emb_dict = {}
    for entry in data["entries"]:
        emb_dict[entry["id"]] = np.array(entry["embedding"], dtype=np.float32)
    print(f"Loaded {len(emb_dict)} embeddings, dim={len(next(iter(emb_dict.values())))}")
    return emb_dict


def load_pairs() -> dict[str, list]:
    with open(PAIRS_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)
    pairs = data["pairs"]
    print("Loaded pairs:")
    for k, v in pairs.items():
        print(f"  {k}: {len(v)}")
    return pairs


def train(args):
    torch.manual_seed(SEED)
    np.random.seed(SEED)
    random.seed(SEED)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Device: {device}")

    embeddings = load_embeddings()
    pairs = load_pairs()

    # Build datasets for each axis
    axis_names = ["topic", "location", "phenomenon"]
    datasets = {}
    loaders = {}

    for axis in axis_names:
        key = f"{axis}_positive"
        if key not in pairs:
            print(f"WARNING: {key} not found in pairs, skipping axis {axis}")
            continue
        ds = ContrastivePairDataset([tuple(p) for p in pairs[key]], embeddings)
        datasets[axis] = ds
        loaders[axis] = DataLoader(ds, batch_size=BATCH_SIZE, shuffle=True, drop_last=True)
        print(f"  {axis} dataset: {len(ds)} pairs")

    if len(datasets) < 2:
        print("ERROR: Need at least 2 axes. Run build_pairs.py first.")
        return

    # Model
    model = AspectProjection(EMBED_DIM, NUM_AXES, SUBSPACE_DIM).to(device)
    optimizer = torch.optim.Adam(model.parameters(), lr=args.lr, weight_decay=1e-5)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=args.epochs)

    print(f"\nModel: {EMBED_DIM}d → {PROJ_DIM}d ({NUM_AXES} axes × {SUBSPACE_DIM}d)")
    print(f"Parameters: {sum(p.numel() for p in model.parameters()):,}")
    print(f"Training: {args.epochs} epochs, lr={args.lr}, λ_orthog={args.lambda_orthog}")
    print()

    log = {"epochs": [], "losses": {k: [] for k in axis_names + ["orthog", "total"]}}
    best_loss = float("inf")

    for epoch in range(1, args.epochs + 1):
        model.train()
        epoch_losses = {k: 0.0 for k in axis_names + ["orthog", "total"]}
        n_batches = 0

        iters = {axis: iter(loader) for axis, loader in loaders.items()}

        while True:
            total_loss = torch.tensor(0.0, device=device)
            all_subspaces = []
            any_batch = False

            for axis_idx, axis in enumerate(axis_names):
                if axis not in iters:
                    continue
                try:
                    anchor, positive = next(iters[axis])
                except StopIteration:
                    continue

                any_batch = True
                anchor, positive = anchor.to(device), positive.to(device)
                subspaces_a = model(anchor)
                subspaces_p = model(positive)

                # InfoNCE on the corresponding subspace
                loss_axis = info_nce_loss(subspaces_a[axis_idx], subspaces_p[axis_idx])
                total_loss = total_loss + loss_axis
                epoch_losses[axis] += loss_axis.item()
                all_subspaces.append(subspaces_a)

            if not any_batch:
                break

            # Orthogonality: penalize all subspace pairs
            if all_subspaces:
                subspaces_for_orthog = all_subspaces[0]
                loss_orthog = pairwise_orthogonality_loss(subspaces_for_orthog)
                total_loss = total_loss + args.lambda_orthog * loss_orthog
                epoch_losses["orthog"] += loss_orthog.item()

            epoch_losses["total"] += total_loss.item()

            optimizer.zero_grad()
            total_loss.backward()
            optimizer.step()
            n_batches += 1

        scheduler.step()

        if n_batches > 0:
            for k in epoch_losses:
                epoch_losses[k] /= n_batches

        log["epochs"].append(epoch)
        for k in epoch_losses:
            log["losses"][k].append(epoch_losses[k])

        if epoch % 10 == 0 or epoch == 1:
            parts = [f"L_{k}={epoch_losses[k]:.4f}" for k in axis_names if k in loaders]
            parts.append(f"L_orth={epoch_losses['orthog']:.4f}")
            parts.append(f"L_total={epoch_losses['total']:.4f}")
            print(f"Epoch {epoch:3d}/{args.epochs}  " + "  ".join(parts))

        if epoch_losses["total"] < best_loss:
            best_loss = epoch_losses["total"]
            torch.save({
                "model_state_dict": model.state_dict(),
                "config": {
                    "input_dim": EMBED_DIM,
                    "num_axes": NUM_AXES,
                    "subspace_dim": SUBSPACE_DIM,
                    "axis_names": axis_names,
                },
            }, OUTPUT_WEIGHTS)

    with open(OUTPUT_LOG, "w", encoding="utf-8") as f:
        json.dump(log, f, indent=2)

    print(f"\nBest total loss: {best_loss:.4f}")
    print(f"Weights saved to: {OUTPUT_WEIGHTS}")
    print(f"Training log saved to: {OUTPUT_LOG}")


def main():
    parser = argparse.ArgumentParser(description="Train 3-axis aspect-disentangled projection")
    parser.add_argument("--epochs", type=int, default=100)
    parser.add_argument("--lr", type=float, default=1e-3)
    parser.add_argument("--lambda-orthog", type=float, default=0.1)
    args = parser.parse_args()
    train(args)


if __name__ == "__main__":
    main()

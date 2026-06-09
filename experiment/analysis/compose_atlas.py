"""Compose the 66-yokai atlas figure: 11 columns × 6 rows.
Each cell is a square thumbnail; trend (style register, contemporary cluster,
mode-collapse cluster) becomes visible across the grid.

Cells listed in NERF_INDICES are heavy-blurred and dimmed to suppress
incidental resemblance to copyrighted character designs.
"""
import os, sys, re
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageEnhance
sys.stdout.reconfigure(encoding="utf-8")

# Indices to nerf (chronological order of generation): mascot-style outputs
# that incidentally resemble well-known copyrighted characters.
NERF_INDICES = {56}

IMG_DIR = r"c:\Users\kosuk\yokai\experiment\data\all_images"
OUT_DIR = r"c:\Users\kosuk\yokai\paper\siggraph\figures"

# Grid: 11 cols × 6 rows = 66 cells
COLS, ROWS = 11, 6
CELL = 160      # cell size in px
PAD  = 2        # gap between cells
W = COLS * CELL + (COLS + 1) * PAD
H = ROWS * CELL + (ROWS + 1) * PAD

canvas = Image.new("RGB", (W, H), "white")

# Sort files by index prefix (chronological)
files = sorted([f for f in os.listdir(IMG_DIR) if f.endswith(".jpg")])
print(f"{len(files)} files to place")

for i, fn in enumerate(files):
    r, c = i // COLS, i % COLS
    x = PAD + c * (CELL + PAD)
    y = PAD + r * (CELL + PAD)
    img = Image.open(os.path.join(IMG_DIR, fn)).convert("RGB")
    # center-square crop
    w, h = img.size
    s = min(w, h)
    img = img.crop(((w - s) // 2, (h - s) // 2, (w + s) // 2, (h + s) // 2))
    img = img.resize((CELL, CELL), Image.LANCZOS)
    if i in NERF_INDICES:
        img = img.filter(ImageFilter.GaussianBlur(radius=18))
        img = ImageEnhance.Brightness(img).enhance(0.5)
        img = ImageEnhance.Contrast(img).enhance(0.6)
    canvas.paste(img, (x, y))

out_jpg = os.path.join(OUT_DIR, "fig4_atlas.jpg")
out_pdf = os.path.join(OUT_DIR, "fig4_atlas.pdf")
canvas.save(out_jpg, "JPEG", quality=85, optimize=True)
canvas.save(out_pdf, "PDF", resolution=150.0)
print(f"Saved: {out_jpg}  ({W}x{H})")
print(f"Saved: {out_pdf}")

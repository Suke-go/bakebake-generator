"""Compose Figure 6: the 5 contemporary-anxiety yokai in a 2x3 grid with captions.
Outputs JPG (high resolution) and PDF for paper inclusion.
"""
import sys
from PIL import Image, ImageDraw, ImageFont
import os

sys.stdout.reconfigure(encoding="utf-8")

IMG_DIR = r"c:\Users\kosuk\yokai\experiment\data\cluster_images"
OUT_DIR = r"c:\Users\kosuk\yokai\paper\siggraph\figures"
os.makedirs(OUT_DIR, exist_ok=True)

# Order and captions (English for paper inclusion)
panels = [
    ("増殖残業.jpg",   "Zoshoku-zangyo",  "Overtime that multiplies through the night"),
    ("験収不順.jpg",   "Kenshu-fujun",    "Stagnation in the audit of records"),
    ("断電彷徨.jpg",   "Dandenhoko",      "Presence at the moment of power loss"),
    ("工場夕影.jpg",   "Kojo-yuei",       "Faces missing from photographs at twilight"),
    ("通り月.jpg",     "Tori-tsuki",      "Intrusive image of a colleague during work"),
]

# Panel layout: 2 rows x 3 cols. 5 panels + 1 empty cell.
CELL_W = 480
CELL_H = 560
CAP_H  = 80
ROWS = 2
COLS = 3
PADDING = 12

canvas_w = COLS * CELL_W + (COLS+1) * PADDING
canvas_h = ROWS * CELL_H + (ROWS+1) * PADDING
canvas = Image.new("RGB", (canvas_w, canvas_h), "white")
draw = ImageDraw.Draw(canvas)

# Try to load a font
try:
    font_title = ImageFont.truetype("arial.ttf", 22)
    font_body  = ImageFont.truetype("arial.ttf", 16)
except Exception:
    font_title = ImageFont.load_default()
    font_body  = ImageFont.load_default()

for i, (filename, title, caption) in enumerate(panels):
    r = i // COLS
    c = i % COLS
    x = PADDING + c * (CELL_W + PADDING)
    y = PADDING + r * (CELL_H + PADDING)

    path = os.path.join(IMG_DIR, filename)
    try:
        img = Image.open(path).convert("RGB")
    except Exception as e:
        print(f"  could not load {filename}: {e}")
        continue
    # Image area: CELL_W x (CELL_H - CAP_H)
    img_h = CELL_H - CAP_H
    img.thumbnail((CELL_W, img_h), Image.LANCZOS)
    img_x = x + (CELL_W - img.width) // 2
    img_y = y + (img_h - img.height) // 2
    canvas.paste(img, (img_x, img_y))

    # Border around image area
    draw.rectangle([x, y, x + CELL_W, y + img_h], outline="black", width=1)

    # Caption area
    cap_y = y + img_h + 6
    draw.text((x + 8, cap_y), title, fill="black", font=font_title)
    # Wrap caption
    words = caption.split()
    lines, line = [], ""
    for w in words:
        test = (line + " " + w).strip()
        if len(test) > 38:
            lines.append(line)
            line = w
        else:
            line = test
    if line:
        lines.append(line)
    for j, ln in enumerate(lines):
        draw.text((x + 8, cap_y + 32 + j*20), ln, fill="black", font=font_body)

out_jpg = os.path.join(OUT_DIR, "fig6_contemporary_cluster.jpg")
out_pdf = os.path.join(OUT_DIR, "fig6_contemporary_cluster.pdf")
canvas.save(out_jpg, "JPEG", quality=90)
canvas.save(out_pdf, "PDF", resolution=200.0)
print(f"Saved: {out_jpg}")
print(f"Saved: {out_pdf}")

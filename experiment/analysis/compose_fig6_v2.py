"""Redesign Fig 6: 5 contemporary-cluster yokai as landscape 5-panel.
Each panel shows the image + romanized name + English meaning.
"""
import os, sys
from PIL import Image, ImageDraw, ImageFont

sys.stdout.reconfigure(encoding="utf-8")

IMG_DIR = r"c:\Users\kosuk\yokai\experiment\data\cluster_images"
OUT_DIR = r"c:\Users\kosuk\yokai\paper\siggraph\figures"

try:
    font_name   = ImageFont.truetype("arialbd.ttf", 22)
    font_gloss  = ImageFont.truetype("arial.ttf",   17)
    font_desc   = ImageFont.truetype("arial.ttf",   14)
except Exception:
    font_name = font_gloss = font_desc = ImageFont.load_default()

panels = [
    ("増殖残業.jpg",   "Zōshoku-zangyō", "Multiplying Overtime",
     "Work at night that multiplies."),
    ("験収不順.jpg",   "Kenshū-fujun",        "Inspection Irregularity",
     "Stagnation in a data audit."),
    ("断電彷徨.jpg",   "Dandenhōkō",      "Power-Outage Wandering",
     "Presence at the moment of power loss."),
    ("工場夕影.jpg",   "Kōjō-yūei",   "Factory Dusk-Shadow",
     "Faces missing from factory photographs."),
    ("通り月.jpg",     "Tōri-tsuki",            "Passing Moon",
     "Intrusive image of a colleague."),
]

PANEL_W = 360
IMG_H   = 360
CAP_H   = 100
PAD     = 10
canvas_w = len(panels) * PANEL_W + (len(panels) + 1) * PAD
canvas_h = IMG_H + CAP_H + 2 * PAD

canvas = Image.new("RGB", (canvas_w, canvas_h), "white")
draw = ImageDraw.Draw(canvas)

for i, (filename, romaji, english, descr) in enumerate(panels):
    x = PAD + i * (PANEL_W + PAD)
    y = PAD
    img = Image.open(os.path.join(IMG_DIR, filename)).convert("RGB")
    # Square crop to image area
    img.thumbnail((PANEL_W, IMG_H), Image.LANCZOS)
    img_x = x + (PANEL_W - img.width) // 2
    img_y = y + (IMG_H - img.height) // 2
    canvas.paste(img, (img_x, img_y))
    draw.rectangle([x, y, x + PANEL_W, y + IMG_H], outline="black", width=1)
    # Romaji + English on one line (or two if needed)
    cap_y = y + IMG_H + 8
    draw.text((x + 8, cap_y), romaji, fill="black", font=font_name)
    bbox = draw.textbbox((0, 0), romaji, font=font_name)
    name_w = bbox[2] - bbox[0]
    draw.text((x + 8 + name_w + 12, cap_y + 4), english, fill="#555555", font=font_gloss)
    # Description below
    draw.text((x + 8, cap_y + 36), descr, fill="#444444", font=font_desc)

out_jpg = os.path.join(OUT_DIR, "fig6_contemporary_cluster.jpg")
out_pdf = os.path.join(OUT_DIR, "fig6_contemporary_cluster.pdf")
canvas.save(out_jpg, "JPEG", quality=90)
canvas.save(out_pdf, "PDF", resolution=200.0)
print(f"Saved: {out_jpg}  ({canvas_w}x{canvas_h})")
print(f"Saved: {out_pdf}")

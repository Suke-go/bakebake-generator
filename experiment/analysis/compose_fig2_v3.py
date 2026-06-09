"""Redesign Fig 2: visual walkthrough of the apparatus pipeline.

Five horizontal panels showing each stage, with the final result anchored
to a real generated output (Zōshoku-zangyō).
"""
import os, sys, math
from PIL import Image, ImageDraw, ImageFont

sys.stdout.reconfigure(encoding="utf-8")

OUT_DIR = r"c:\Users\kosuk\yokai\paper\siggraph\figures"
IMG_DIR = r"c:\Users\kosuk\yokai\experiment\data\cluster_images"

try:
    font_h1     = ImageFont.truetype("arialbd.ttf", 26)
    font_stage  = ImageFont.truetype("arialbd.ttf", 17)
    font_body   = ImageFont.truetype("arial.ttf", 13)
    font_small  = ImageFont.truetype("arial.ttf", 12)
    font_mono   = ImageFont.truetype("consola.ttf", 12)
except Exception:
    font_h1 = font_stage = font_body = font_small = font_mono = ImageFont.load_default()

W, H = 1800, 540
canvas = Image.new("RGB", (W, H), "white")
draw = ImageDraw.Draw(canvas)

# Title
draw.text((40, 22), "Apparatus pipeline", fill="black", font=font_h1)
draw.text((40, 56), "Five stages from a written account of an experience to a printed receipt. Each stage produces an AI proposal that the participant accepts, modifies, or refuses.",
          fill="#555555", font=font_body)

# Panel layout
margin_x = 40
margin_y = 110
panel_w = 320
panel_h = 320
gap = 30
n = 5

def draw_panel(x, y, w, h, idx, name, body_lines, icon_fn=None):
    # Outer box
    draw.rectangle([x, y, x + w, y + h], outline="black", width=1)
    # Number circle
    cx = x + 22
    cy = y + 22
    r = 13
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill="black")
    bbox = draw.textbbox((0, 0), str(idx), font=font_stage)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    draw.text((cx - tw // 2, cy - th // 2 - 2), str(idx), fill="white", font=font_stage)
    # Stage name
    draw.text((x + 44, y + 12), name, fill="black", font=font_stage)
    # Icon area (middle of panel)
    icon_y = y + 60
    icon_h = 150
    if icon_fn:
        icon_fn(x, icon_y, w, icon_h)
    # Body text
    text_y = y + 60 + icon_h + 10
    for line in body_lines:
        draw.text((x + 14, text_y), line, fill="#333333", font=font_small)
        text_y += 18

# Icon drawing functions
def icon_text_lines(x, y, w, h):
    # Stylized text input: 4 horizontal lines of varying length
    margin = 30
    line_y = y + 20
    for i, frac in enumerate([0.85, 0.7, 0.9, 0.55]):
        line_w = (w - 2 * margin) * frac
        draw.rectangle([x + margin, line_y, x + margin + line_w, line_y + 6], fill="#666666")
        line_y += 22
    # Add a "pen" symbol
    draw.text((x + w - 60, y + 5), "›››", fill="#999999", font=font_h1)

def icon_retrieval(x, y, w, h):
    # Show top-5 retrieval as 5 small horizontal bars representing matched entries
    bar_x = x + 30
    bar_y = y + 16
    bar_w = w - 60
    for i in range(5):
        score = 0.92 - 0.04 * i  # decreasing similarity
        fill_w = int(bar_w * (score - 0.7) / 0.22)
        # Background
        draw.rectangle([bar_x, bar_y, bar_x + bar_w, bar_y + 14], outline="#cccccc", width=1)
        # Filled portion
        draw.rectangle([bar_x, bar_y, bar_x + fill_w, bar_y + 14], fill="#1a1a1a")
        # Score label
        draw.text((bar_x + bar_w + 8, bar_y - 2), f"{score:.2f}", fill="#555555", font=font_small)
        bar_y += 24

def icon_naming(x, y, w, h):
    # 3 candidate boxes, one selected
    box_y = y + 16
    box_w = w - 60
    box_h = 34
    box_x = x + 30
    labels = ["Phenomenon-descriptive", "Place-conditional", "Sensory-onomatopoeic"]
    for i, label in enumerate(labels):
        if i == 0:
            # selected
            draw.rectangle([box_x, box_y, box_x + box_w, box_y + box_h], fill="black")
            draw.text((box_x + 10, box_y + 10), label, fill="white", font=font_small)
            draw.text((box_x + box_w - 30, box_y + 10), "✓", fill="white", font=font_stage)
        else:
            draw.rectangle([box_x, box_y, box_x + box_w, box_y + box_h], outline="#999999", width=1)
            draw.text((box_x + 10, box_y + 10), label, fill="#666666", font=font_small)
        box_y += box_h + 6

def icon_image(x, y, w, h):
    # Show actual generated image (Zoshoku-zangyo)
    img_path = os.path.join(IMG_DIR, "増殖残業.jpg")
    if os.path.exists(img_path):
        img = Image.open(img_path).convert("RGB")
        # Fit into icon area
        max_side = min(w - 60, h - 10)
        img.thumbnail((max_side, max_side), Image.LANCZOS)
        img_x = x + (w - img.width) // 2
        img_y = y + (h - img.height) // 2
        canvas.paste(img, (img_x, img_y))
        draw.rectangle([img_x, img_y, img_x + img.width, img_y + img.height], outline="#666666", width=1)

def icon_receipt(x, y, w, h):
    # Stylized receipt: tall narrow rectangle with content
    rect_w = 100
    rect_h = h - 10
    rx = x + (w - rect_w) // 2
    ry = y + 5
    # Shadow
    draw.rectangle([rx + 4, ry + 4, rx + rect_w + 4, ry + rect_h + 4], fill="#dddddd")
    # Paper
    draw.rectangle([rx, ry, rx + rect_w, ry + rect_h], fill="white", outline="#666666", width=1)
    # Header line
    draw.line([(rx + 10, ry + 14), (rx + rect_w - 10, ry + 14)], fill="#999999", width=1)
    # Yokai name placeholder
    draw.text((rx + 10, ry + 22), "Zōshoku-", fill="#222222", font=font_small)
    draw.text((rx + 10, ry + 36), "zangyō", fill="#222222", font=font_small)
    # Image placeholder (small)
    iy = ry + 56
    draw.rectangle([rx + 10, iy, rx + rect_w - 10, iy + 50], fill="#888888")
    # Narrative lines
    for i in range(5):
        ly = iy + 56 + i * 9
        draw.line([(rx + 10, ly), (rx + rect_w - 10 - i * 4, ly)], fill="#aaaaaa", width=1)
    # Footer
    fy = ry + rect_h - 18
    draw.line([(rx + 10, fy), (rx + rect_w - 10, fy)], fill="#999999", width=1)
    draw.text((rx + 10, fy + 4), "QR · ID", fill="#888888", font=font_small)
    # Fade arrow
    draw.text((x + w - 60, y + h - 18), "→ fades", fill="#999999", font=font_small)

panels = [
    (1, "Articulation",   icon_text_lines, ["Free-text input.", "No predefined", "categories. The", "participant's own", "words are kept."]),
    (2, "Retrieval",      icon_retrieval,  ["Top-5 cosine match", "against 35,305", "Nichibunken entries.", "Used as context", "for the next stage."]),
    (3, "Naming",         icon_naming,     ["Three candidates", "in three folkloric", "naming patterns.", "Participant selects,", "edits, or refuses."]),
    (4, "Visualization",  icon_image,      ["Ink wash, woodblock,", "or scroll register.", "Example: Zōshoku-zangyō,", "a workplace yōkai", "without precedent."]),
    (5, "Print",          icon_receipt,    ["80mm thermal paper.", "Carried home.", "Fades over months.", "No archive on the", "apparatus side."]),
]

for i, (num, name, icon_fn, body) in enumerate(panels):
    x = margin_x + i * (panel_w + gap) + ((W - 2 * margin_x - n * panel_w - (n - 1) * gap) // 2)
    draw_panel(x, margin_y, panel_w, panel_h, num, name, body, icon_fn)
    # Arrow to next panel
    if i < n - 1:
        ax = x + panel_w + 4
        ay = margin_y + panel_h // 2
        draw.line([(ax, ay), (ax + gap - 8, ay)], fill="black", width=2)
        draw.polygon([(ax + gap - 4, ay), (ax + gap - 14, ay - 6), (ax + gap - 14, ay + 6)], fill="black")

# Footer note
foot_y = margin_y + panel_h + 32
draw.text((margin_x, foot_y), "Total time per session: 3 to 5 minutes.   At every stage the AI's contribution is a proposal that the participant can override.",
          fill="#555555", font=font_body)

out_jpg = os.path.join(OUT_DIR, "fig2_system_flow.jpg")
out_pdf = os.path.join(OUT_DIR, "fig2_system_flow.pdf")
canvas.save(out_jpg, "JPEG", quality=92)
canvas.save(out_pdf, "PDF", resolution=200.0)
print(f"Saved: {out_jpg}  ({W}x{H})")
print(f"Saved: {out_pdf}")

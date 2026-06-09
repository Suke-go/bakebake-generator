"""Teaser v4: one yokai example + participants using the system, faces blurred.

Layout: 1 large yokai image on the left (Zoshoku-zangyo), two participant
photos on the right showing the system in use. Faces in the photos are
auto-blurred via OpenCV face detection.
"""
import os, sys
import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont
sys.stdout.reconfigure(encoding="utf-8")

EXPO_DIR = r"c:\Users\kosuk\yokai\paper\siggraph\figures\EXPO"
CLUSTER_DIR = r"c:\Users\kosuk\yokai\experiment\data\cluster_images"
OUT_DIR = r"c:\Users\kosuk\yokai\paper\siggraph\figures"


def blur_faces(pil_img, scale_factor=1.05, min_neighbors=3, min_size=(30, 30)):
    """Detect faces with multiple OpenCV cascades (frontal + profile + alt) and
    pixelate each face region in the image. Returns a new PIL image."""
    cv = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)
    gray = cv2.cvtColor(cv, cv2.COLOR_BGR2GRAY)
    front_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
    front_alt_path = cv2.data.haarcascades + "haarcascade_frontalface_alt.xml"
    front_alt2_path = cv2.data.haarcascades + "haarcascade_frontalface_alt2.xml"
    profile_path = cv2.data.haarcascades + "haarcascade_profileface.xml"
    cascades = [
        cv2.CascadeClassifier(front_path),
        cv2.CascadeClassifier(front_alt_path),
        cv2.CascadeClassifier(front_alt2_path),
        cv2.CascadeClassifier(profile_path),
    ]
    faces = []
    for cascade in cascades:
        faces += list(cascade.detectMultiScale(gray, scale_factor, min_neighbors, minSize=min_size))
    # Also try profile on horizontally flipped image (for opposite-facing profiles)
    profile_cascade = cv2.CascadeClassifier(profile_path)
    flipped = cv2.flip(gray, 1)
    profiles_r = profile_cascade.detectMultiScale(flipped, scale_factor, min_neighbors, minSize=min_size)
    h_img = gray.shape[1]
    for (x, y, w, h) in profiles_r:
        faces.append((h_img - x - w, y, w, h))
    print(f"  detected {len(faces)} face regions")
    for (x, y, w, h) in faces:
        # Expand the face region a bit for safety
        pad = int(0.20 * max(w, h))
        x0 = max(0, x - pad)
        y0 = max(0, y - pad)
        x1 = min(cv.shape[1], x + w + pad)
        y1 = min(cv.shape[0], y + h + pad)
        roi = cv[y0:y1, x0:x1]
        if roi.size == 0:
            continue
        # Pixelate by downscale-upscale plus heavy blur for stronger anonymization
        small = cv2.resize(roi, (max(1, (x1 - x0) // 16), max(1, (y1 - y0) // 16)),
                           interpolation=cv2.INTER_LINEAR)
        pix = cv2.resize(small, (x1 - x0, y1 - y0), interpolation=cv2.INTER_NEAREST)
        cv[y0:y1, x0:x1] = pix
    return Image.fromarray(cv2.cvtColor(cv, cv2.COLOR_BGR2RGB))


def fit_height(img, target_h):
    w, h = img.size
    new_w = int(w * target_h / h)
    return img.resize((new_w, target_h), Image.LANCZOS)


def crop_aspect(img, target_aspect):
    """Center-crop the image to the requested aspect ratio (w/h)."""
    w, h = img.size
    aspect = w / h
    if aspect > target_aspect:
        new_w = int(h * target_aspect)
        x0 = (w - new_w) // 2
        return img.crop((x0, 0, x0 + new_w, h))
    new_h = int(w / target_aspect)
    y0 = (h - new_h) // 2
    return img.crop((0, y0, w, y0 + new_h))


W = 2400
H = 900
GAP = 12
canvas = Image.new("RGB", (W, H), "white")

# Left panel: Zoshoku-zangyo, large
left_w = int(W * 0.42)
left_img = Image.open(os.path.join(CLUSTER_DIR, "増殖残業.jpg")).convert("RGB")
left_img = crop_aspect(left_img, left_w / H)
left_img = left_img.resize((left_w, H), Image.LANCZOS)
canvas.paste(left_img, (0, 0))

# Right panel: two participant photos stacked
right_w = W - left_w - GAP
right_h = (H - GAP) // 2

photo_top = Image.open(os.path.join(EXPO_DIR, "DSC07333.JPG")).convert("RGB")
photo_top = blur_faces(photo_top)
photo_top = crop_aspect(photo_top, right_w / right_h)
photo_top = photo_top.resize((right_w, right_h), Image.LANCZOS)
canvas.paste(photo_top, (left_w + GAP, 0))

photo_bot = Image.open(os.path.join(EXPO_DIR, "DSC07340.JPG")).convert("RGB")
photo_bot = blur_faces(photo_bot)
photo_bot = crop_aspect(photo_bot, right_w / right_h)
photo_bot = photo_bot.resize((right_w, right_h), Image.LANCZOS)
canvas.paste(photo_bot, (left_w + GAP, right_h + GAP))

out_jpg = os.path.join(OUT_DIR, "fig1_teaser.jpg")
out_pdf = os.path.join(OUT_DIR, "fig1_teaser.pdf")
canvas.save(out_jpg, "JPEG", quality=90)
canvas.save(out_pdf, "PDF", resolution=150.0)
print(f"Saved: {out_jpg}  ({W}x{H})  ratio {W / H:.2f}:1")

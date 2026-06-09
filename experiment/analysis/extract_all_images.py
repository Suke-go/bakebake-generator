"""Extract all 66 generated yokai images for the atlas figure."""
import pandas as pd, base64, os, sys, re
sys.stdout.reconfigure(encoding="utf-8")

raw = pd.read_csv(r"c:\Users\kosuk\yokai\experiment\data\surveys_raw.csv")
gen = raw[raw["yokai_name"].notna() & raw["yokai_image_b64"].notna()].copy()
gen = gen.sort_values("created_at").reset_index(drop=True)

out_dir = r"c:\Users\kosuk\yokai\experiment\data\all_images"
os.makedirs(out_dir, exist_ok=True)

print(f"Extracting {len(gen)} images...")
for i, r in gen.iterrows():
    name = re.sub(r'[\\/:*?"<>|]', "_", str(r["yokai_name"]))
    b64 = str(r["yokai_image_b64"])
    if "," in b64:
        b64 = b64.split(",", 1)[1]
    try:
        data = base64.b64decode(b64)
        path = os.path.join(out_dir, f"{i:02d}_{name}.jpg")
        with open(path, "wb") as f:
            f.write(data)
    except Exception as e:
        print(f"  ERR {name}: {e}")
print(f"Done. {len(os.listdir(out_dir))} files in {out_dir}")

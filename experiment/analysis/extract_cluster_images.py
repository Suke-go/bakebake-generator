"""Extract the 5 contemporary-cluster yokai images for Figure 3 (or 6)."""
import pandas as pd, base64, os, sys, re
sys.stdout.reconfigure(encoding="utf-8")

raw = pd.read_csv("data/surveys_raw.csv")

cluster_names = ["増殖残業", "験収不順", "断電彷徨", "工場夕影", "通り月"]

out_dir = "data/cluster_images"
os.makedirs(out_dir, exist_ok=True)

for name in cluster_names:
    rows = raw[raw["yokai_name"] == name]
    if rows.empty:
        print(f"NOT FOUND: {name}")
        continue
    row = rows.iloc[0]
    b64 = str(row.get("yokai_image_b64", ""))
    if "," in b64:
        b64 = b64.split(",", 1)[1]
    try:
        data = base64.b64decode(b64)
        safe = re.sub(r'[\\/:*?"<>|]', '_', name)
        path = os.path.join(out_dir, f"{safe}.jpg")
        with open(path, "wb") as f:
            f.write(data)
        print(f"  {path}  ({len(data)//1024} KB)")
    except Exception as e:
        print(f"  ERROR {name}: {e}")

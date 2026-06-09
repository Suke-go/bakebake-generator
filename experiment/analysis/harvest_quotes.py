"""Extract all post-experience qualitative responses with full context
for selection of additional supporting quotes.
"""
import pandas as pd, sys
sys.stdout.reconfigure(encoding="utf-8")

raw = pd.read_csv(r"c:\Users\kosuk\yokai\experiment\data\surveys_raw.csv")
val = raw[raw["post_completed"] == True].copy()
print(f"N post-completed: {len(val)}")

# Sort by created date
val = val.sort_values("created_at").reset_index(drop=True)

print("\n" + "="*80)
print("ALL POST-COMPLETED RESPONSES (sorted by date)")
print("="*80)
for i, r in val.iterrows():
    theme = str(r.get("post_theme") or "(none)")[:200]
    impr = str(r.get("post_impression") or "(none)")[:300]
    yokai = str(r.get("yokai_name") or "(none)")
    pre_image = str(r.get("pre_image") or "(none)")
    age = str(r.get("pre_age") or "?")
    vt = str(r.get("visitor_type") or "?")
    pre_p = str(r.get("pre_yokai_perception") or "?")
    post_p = str(r.get("post_yokai_perception") or "?")
    print(f"\n[{i+1:2d}] {r['created_at'][:10]} | {vt} | {age} | pre_image='{pre_image}' | yokai='{yokai}'")
    print(f"     Pre/post perception: {pre_p} -> {post_p}")
    print(f"     Theme: {theme}")
    print(f"     Impression: {impr}")

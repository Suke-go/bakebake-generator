"""Test whether the contemporary-anxiety candidates contain setting vocabulary
absent from the 35,305-entry Nichibunken corpus.

The embedding-distance analysis (classifiability.py) shows that all 66 generated
yokai share register-level similarity with the corpus (max-cosine 0.73-0.80,
tight). This is because register words (姿は見えぬ, 気配, 怪異) dominate the
embedding. To test content novelty we instead search for SETTING tokens that
characterize contemporary life (workplace, factory, audit, power loss, etc.)
"""
import csv, json, sys, re
import pandas as pd

sys.stdout.reconfigure(encoding="utf-8")

NICHIBUN_CSV = r"c:\Users\kosuk\yokai\data\nichibun\nichibun_yokai_full.csv"
GEN_CSV      = r"c:\Users\kosuk\yokai\experiment\data\surveys_raw.csv"

# Setting categories with token lists
SETTINGS = {
    "workplace/office":     ["職場", "会社", "残業", "オフィス", "業務", "勤務先", "出勤"],
    "school":               ["学校", "教室", "校舎", "通学"],
    "factory/industrial":   ["工場", "プラント", "倉庫", "産業"],
    "data/audit":           ["監査", "験収", "決算", "帳簿", "データ", "資料が"],
    "infrastructure":       ["電源", "停電", "断電", "コンセント", "充電", "ネット", "回線"],
    "event venue":          ["イベント会場", "コンベンション", "会場", "展示"],
    "photography":          ["写真", "撮影", "カメラ", "シャッター"],
    "modern transport":     ["電車", "車内", "駅", "バス", "高速道路"],
    "home":                 ["自宅", "家", "屋内", "部屋", "寝室", "玄関"],
    "road/path":            ["道", "路", "辻", "峠", "山道"],
    "water":                ["川", "海", "池", "湖", "井戸", "水辺"],
    "mountain/wilds":       ["山", "森", "野原"],
}

print("Loading Nichibunken corpus...")
corpus_summaries = []
with open(NICHIBUN_CSV, encoding="utf-8") as f:
    reader = csv.DictReader(f)
    for row in reader:
        corpus_summaries.append((row.get("name_kanji") or row.get("name_reading", ""),
                                 row.get("summary", "")))
print(f"  {len(corpus_summaries)} entries")

print("\nLoading generated yokai...")
raw = pd.read_csv(GEN_CSV)
gen = raw[raw["yokai_name"].notna() & raw["yokai_desc"].notna()].copy().reset_index(drop=True)
print(f"  {len(gen)} generated yokai")

def find_setting(text, settings):
    """Return list of setting categories whose tokens appear in text."""
    matches = []
    for cat, tokens in settings.items():
        for t in tokens:
            if t in text:
                matches.append((cat, t))
                break
    return matches

# Classify generated yokai
print("\n" + "="*72)
print("SETTING DISTRIBUTION — generated 66 yokai")
print("="*72)
gen_settings = {cat: [] for cat in SETTINGS}
for _, row in gen.iterrows():
    text = str(row["yokai_desc"])
    for cat, tok in find_setting(text, SETTINGS):
        gen_settings[cat].append((row["yokai_name"], tok))
for cat in SETTINGS:
    print(f"  {cat:<22} {len(gen_settings[cat]):>3}")

# Classify corpus
print("\n" + "="*72)
print("SETTING DISTRIBUTION — Nichibunken corpus (35,305 entries)")
print("="*72)
corpus_counts = {cat: 0 for cat in SETTINGS}
for name, summ in corpus_summaries:
    for cat, _ in find_setting(summ, SETTINGS):
        corpus_counts[cat] += 1
n = len(corpus_summaries)
for cat in SETTINGS:
    c = corpus_counts[cat]
    print(f"  {cat:<22} {c:>5}  ({c/n*100:.2f}%)")

# Contemporary settings comparison
print("\n" + "="*72)
print("CONTEMPORARY SETTINGS — generated vs corpus (%)")
print("="*72)
contemp = ["workplace/office", "factory/industrial", "data/audit",
           "infrastructure", "event venue", "photography"]
print(f"{'setting':<22} {'generated %':>12} {'corpus %':>10} {'ratio':>8}")
for cat in contemp:
    g_pct = len(gen_settings[cat]) / len(gen) * 100
    c_pct = corpus_counts[cat] / n * 100
    ratio = g_pct / c_pct if c_pct > 0 else float("inf")
    print(f"{cat:<22} {g_pct:>11.1f}% {c_pct:>9.2f}% {ratio:>7.1f}x")

# Identify yokai whose setting words mark them as contemporary
print("\n" + "="*72)
print("YOKAI WHOSE SETTING IS CONTEMPORARY (workplace, factory, audit, power, event, photo)")
print("="*72)
contemp_set = set(contemp)
contemporary_yokai = []
for _, row in gen.iterrows():
    text = str(row["yokai_desc"])
    matched = find_setting(text, SETTINGS)
    cont_matches = [(c, t) for c, t in matched if c in contemp_set]
    if cont_matches:
        contemporary_yokai.append({
            "name": row["yokai_name"],
            "desc": text[:200],
            "matched_settings": cont_matches,
        })
print(f"\nCount: {len(contemporary_yokai)} / {len(gen)}")
for y in contemporary_yokai:
    cats = ", ".join(f"{c}({t})" for c, t in y["matched_settings"])
    print(f"\n  【{y['name']}】  settings: {cats}")
    print(f"    {y['desc']}")

# Token-level: do ANY entry in corpus contain the contemporary key tokens?
print("\n" + "="*72)
print("TOKEN ABSENCE TEST — do specific contemporary tokens appear in 35,305 corpus entries?")
print("="*72)
specific_tokens = ["残業", "工場", "監査", "停電", "コンセント", "撮影", "写真", "デジカメ",
                   "パソコン", "メール", "オフィス", "コピー機", "プリンター"]
for tok in specific_tokens:
    count = sum(1 for _, summ in corpus_summaries if tok in summ)
    print(f"  '{tok:<10}'  appears in {count:>4} / 35305 corpus entries  ({count/n*100:.3f}%)")

# Save
with open(r"c:\Users\kosuk\yokai\experiment\data\setting_novelty.json", "w", encoding="utf-8") as f:
    json.dump({
        "generated_setting_counts": {k: len(v) for k, v in gen_settings.items()},
        "corpus_setting_counts": corpus_counts,
        "corpus_total": n,
        "generated_total": len(gen),
        "contemporary_yokai": contemporary_yokai,
        "contemporary_settings": contemp,
    }, f, ensure_ascii=False, indent=2)
print("\nSaved to setting_novelty.json")

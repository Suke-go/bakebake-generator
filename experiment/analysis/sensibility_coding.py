"""Code the sensibility expressed in the contemporary-cluster yokai
descriptions by extracting recurring affective/sensorial/locative tokens
and comparing their frequency against the historical corpus.
"""
import pandas as pd, csv, sys, re
from collections import Counter
sys.stdout.reconfigure(encoding="utf-8")

GEN_CSV = r"c:\Users\kosuk\yokai\experiment\data\surveys_raw.csv"
NICHIBUN_CSV = r"c:\Users\kosuk\yokai\data\nichibun\nichibun_yokai_full.csv"

CLUSTER = ["増殖残業", "験収不順", "断電彷徨", "工場夕影", "通り月",
           "夕冷", "チリン", "忘置返"]

# Sensibility code dimensions
CODES = {
    "perception/invisibility": ["見えない", "姿なき", "姿は見え", "見えぬ", "姿なし"],
    "perception/presence-felt": ["気配", "感じ", "知覚"],
    "perception/cold-temperature": ["冷たい", "凍", "底冷え", "寒"],
    "perception/silence-stillness": ["静か", "沈黙", "音もなく"],
    "effect/drain-erosion": ["吸い取", "蝕", "奪", "弱らせ"],
    "effect/multiplication-stagnation": ["増え", "膨らむ", "澱", "停滞"],
    "effect/disappearance": ["消え", "失せ", "なくなる", "見失"],
    "effect/intrusion-of-image": ["脳裏", "思い浮か", "心に響"],
    "locus/workplace": ["職場", "残業", "業務", "オフィス"],
    "locus/institutional-data": ["監査", "データ", "資料", "記録"],
    "locus/infrastructure": ["電源", "停電", "イベント会場", "コンセント"],
    "locus/photographic": ["写真", "撮影", "カメラ", "映像"],
    "locus/screen-mediated": ["画面", "モニタ", "ディスプレイ"],
    "time/night-overtime": ["夜", "深夜", "夜更け"],
    "time/twilight-boundary": ["夕", "黄昏", "逢魔", "薄暮"],
    "agency/no-named-cause": ["怪異", "見えざる", "正体", "誰の"],
}

# Load generated yokai
raw = pd.read_csv(GEN_CSV)
gen = raw[raw["yokai_name"].notna() & raw["yokai_desc"].notna()]
cluster_rows = gen[gen["yokai_name"].isin(CLUSTER)]
non_cluster_rows = gen[~gen["yokai_name"].isin(CLUSTER)]

def count_codes(rows, text_col="yokai_desc"):
    code_counts = {k: 0 for k in CODES}
    n = len(rows)
    for _, row in rows.iterrows():
        text = str(row[text_col])
        for code, tokens in CODES.items():
            for tok in tokens:
                if tok in text:
                    code_counts[code] += 1
                    break
    return code_counts, n

cluster_codes, cluster_n = count_codes(cluster_rows)
non_cluster_codes, non_cluster_n = count_codes(non_cluster_rows)

print("="*80)
print("SENSIBILITY CODING — Contemporary cluster (8) vs Other generated (58)")
print("="*80)
print(f"{'Code':<35} {'Cluster (n=' + str(cluster_n) + ')':<20} {'Other (n=' + str(non_cluster_n) + ')':<20} {'Ratio':<10}")
print("-"*85)
for code in CODES:
    c_pct = cluster_codes[code] / max(cluster_n, 1) * 100
    o_pct = non_cluster_codes[code] / max(non_cluster_n, 1) * 100
    ratio = f"{c_pct/o_pct:.1f}x" if o_pct > 0 else "—"
    print(f"{code:<35} {cluster_codes[code]}/{cluster_n} ({c_pct:>4.0f}%)         {non_cluster_codes[code]}/{non_cluster_n} ({o_pct:>4.0f}%)         {ratio}")

# Also compute against historical corpus (sample)
print()
print("="*80)
print("CORPUS BASELINE — frequency of code tokens in 35,305 Nichibunken entries")
print("="*80)
corpus = []
with open(NICHIBUN_CSV, encoding="utf-8") as f:
    r = csv.DictReader(f)
    for row in r:
        corpus.append(row.get("summary", ""))
print(f"{'Code':<35} {'Corpus %':<10}")
print("-"*45)
total = len(corpus)
for code, tokens in CODES.items():
    hits = sum(1 for s in corpus if any(t in s for t in tokens))
    pct = hits / total * 100
    print(f"{code:<35} {pct:>5.2f}%")

# Per-cluster yokai coding (which codes apply to each)
print()
print("="*80)
print("PER-YOKAI CODE PROFILE")
print("="*80)
for _, row in cluster_rows.iterrows():
    name = row["yokai_name"]
    desc = str(row["yokai_desc"])
    matched = [code for code, toks in CODES.items() if any(t in desc for t in toks)]
    print(f"\n  {name}:")
    print(f"    codes: {', '.join(matched)}")
    print(f"    desc: {desc[:200]}")

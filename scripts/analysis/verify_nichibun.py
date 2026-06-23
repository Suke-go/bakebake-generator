"""Verify Nichibunken scraped data quality."""
import json, re, statistics
from collections import Counter

data = json.load(open(r"c:\Users\kosuk\yokai\data\nichibun\nichibun_yokai_full.json", "r", encoding="utf-8"))
print(f"Total entries: {len(data)}")

# Sample entries
for i in [0, 100, 1000, 10000, 30000]:
    e = data[i]
    nk = e.get("name_kanji", "")
    nr = e.get("name_reading", "")
    pref = e.get("prefecture", "")
    s = e.get("summary", "")[:120]
    slen = len(e.get("summary", ""))
    print(f"\n[{i}] id={e['id']}  name={nk} ({nr})")
    print(f"  pref: {pref}")
    print(f"  summary ({slen} ch): {s}")

# Summary length stats
lens = [len(e.get("summary", "")) for e in data]
print(f"\n=== Summary Length ===")
print(f"min={min(lens)} median={statistics.median(lens):.0f} mean={statistics.mean(lens):.0f} max={max(lens)}")
print(f"  <10ch: {sum(1 for l in lens if l < 10)}")
print(f"  10-50ch: {sum(1 for l in lens if 10 <= l < 50)}")
print(f"  50-200ch: {sum(1 for l in lens if 50 <= l < 200)}")
print(f"  200+ch: {sum(1 for l in lens if l >= 200)}")

# Prefecture distribution
pat = re.compile(
    r"(北海道|青森|岩手|宮城|秋田|山形|福島|茨城|栃木|群馬|埼玉|千葉|東京|神奈川"
    r"|新潟|富山|石川|福井|山梨|長野|岐阜|静岡|愛知|三重|滋賀|京都|大阪|兵庫|奈良"
    r"|和歌山|鳥取|島根|岡山|広島|山口|徳島|香川|愛媛|高知|福岡|佐賀|長崎|熊本|大分"
    r"|宮崎|鹿児島|沖縄)"
)
pref_clean = []
for e in data:
    p = e.get("prefecture", "")
    m = pat.search(p)
    pref_clean.append(m.group(1) if m else "other")

pc = Counter(pref_clean)
print(f"\n=== Prefecture Distribution ({len(pc)} unique) ===")
for p, cnt in pc.most_common(10):
    print(f"  {p}: {cnt}")
other_n = pc.get("other", 0)
print(f"  other: {other_n}")

# Yokai name distribution
names = Counter(e.get("name_kanji", "") for e in data)
print(f"\n=== Yokai Names ({len(names)} unique) ===")
for n, cnt in names.most_common(15):
    print(f"  {n}: {cnt}")

# Key fields with real content (not just scraping artifacts)
print(f"\n=== Usable Fields ===")
summary_ok = sum(1 for e in data if len(e.get("summary", "")) >= 10)
pref_ok = sum(1 for l in pref_clean if l != "other")
name_ok = sum(1 for e in data if e.get("name_kanji", "").strip())
print(f"  summary >= 10ch: {summary_ok}/{len(data)} ({100*summary_ok/len(data):.1f}%)")
print(f"  valid prefecture: {pref_ok}/{len(data)} ({100*pref_ok/len(data):.1f}%)")
print(f"  has name_kanji: {name_ok}/{len(data)} ({100*name_ok/len(data):.1f}%)")

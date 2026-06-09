"""
BAKEBAKE_XR 展示データ分析スクリプト
Supabaseから直接データを取得して包括的な分析を行う
"""

import os
import sys
import json
from pathlib import Path

# --- .env.local から環境変数を読み込む ---
def load_env(env_path):
    """Simple .env file loader"""
    if not os.path.exists(env_path):
        return
    with open(env_path, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            if '=' in line:
                key, _, value = line.partition('=')
                os.environ.setdefault(key.strip(), value.strip())

# プロジェクトルートの .env.local を読む
project_root = Path(__file__).resolve().parent.parent.parent
load_env(project_root / '.env.local')

try:
    from supabase import create_client
except ImportError:
    print("supabaseパッケージをインストールしてください: pip install supabase")
    sys.exit(1)

# -------------------------------------------------------------------
url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
key = os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")

if not url or not key:
    print("Error: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY が見つかりません")
    sys.exit(1)

print(f"Connecting to {url} ...")
sb = create_client(url, key)

# --- 全データ取得 ---
resp = sb.table('surveys').select('*').execute()
all_rows = resp.data
print(f"取得件数 (全レコード): {len(all_rows)}")

if not all_rows:
    print("データがありません。")
    sys.exit(0)

# --- CSV として保存 ---
output_dir = Path(__file__).resolve().parent.parent / 'data'
output_dir.mkdir(parents=True, exist_ok=True)

import csv

fieldnames = list(all_rows[0].keys())
raw_csv = output_dir / 'surveys_raw.csv'
with open(raw_csv, 'w', newline='', encoding='utf-8-sig') as f:
    w = csv.DictWriter(f, fieldnames=fieldnames)
    w.writeheader()
    w.writerows(all_rows)
print(f"  → {raw_csv}")

# --- フィルタ ---
# post_completed == True のものが「完了」レコード
completed = [r for r in all_rows if r.get('post_completed')]
incomplete = [r for r in all_rows if not r.get('post_completed')]

print(f"  完了 (post_completed=True): {len(completed)}")
print(f"  未完了: {len(incomplete)}")

valid_csv = output_dir / 'surveys_valid.csv'
if completed:
    fieldnames_v = list(completed[0].keys())
    with open(valid_csv, 'w', newline='', encoding='utf-8-sig') as f:
        w = csv.DictWriter(f, fieldnames=fieldnames_v)
        w.writeheader()
        w.writerows(completed)
    print(f"  → {valid_csv}")

# ===================================================================
# 分析結果をテキストとして生成
# ===================================================================
lines = []
def pr(s=""):
    lines.append(s)
    print(s)

pr("=" * 70)
pr("BAKEBAKE_XR 展示データ分析レポート")
pr("=" * 70)
pr()

# --- 0. 全セッション概要 ---
pr("## 0. セッション概要")
pr(f"  全レコード数: {len(all_rows)}")
pr(f"  Pre + Post 完了: {len(completed)}")
pr(f"  Pre のみ (Post 未提出): {len(incomplete)}")

# pre_yokai_perception があるものが「事前アンケート回答済」
pre_answered = [r for r in all_rows if r.get('pre_yokai_perception')]
pr(f"  Pre アンケート回答済 (yokai_perception 有): {len(pre_answered)}")

# 妖怪生成済み
generated = [r for r in all_rows if r.get('yokai_name')]
pr(f"  妖怪生成済み (yokai_name 有): {len(generated)}")

# 印刷
printed = [r for r in all_rows if r.get('printed')]
print_triggered = [r for r in all_rows if r.get('print_triggered')]
pr(f"  Print triggered: {len(print_triggered)}")
pr(f"  Printed: {len(printed)}")
pr()

# --- 1. 基礎集計 (全pre回答者) ---
pr("## 1. 基礎集計 (Pre-Survey)")
pr()

# visitor_type
pr("### visitor_type (参加者属性)")
vt_counts = {}
for r in pre_answered:
    v = r.get('visitor_type', '(未回答)')
    vt_counts[v] = vt_counts.get(v, 0) + 1
for k, v in sorted(vt_counts.items(), key=lambda x: -x[1]):
    pr(f"  {k}: {v}")
pr()

# pre_origin
pr("### pre_origin (地域)")
orig_counts = {}
for r in pre_answered:
    v = r.get('pre_origin', '(未回答)')
    orig_counts[v] = orig_counts.get(v, 0) + 1
for k, v in sorted(orig_counts.items(), key=lambda x: -x[1]):
    pr(f"  {k}: {v}")
pr()

# pre_age
pr("### pre_age (年齢層)")
age_counts = {}
for r in pre_answered:
    v = r.get('pre_age', '(未回答)')
    age_counts[v] = age_counts.get(v, 0) + 1
for k, v in sorted(age_counts.items(), key=lambda x: -x[1]):
    pr(f"  {k}: {v}")
pr()

# pre_gender
pr("### pre_gender (性別)")
gen_counts = {}
for r in pre_answered:
    v = r.get('pre_gender') or '(未回答)'
    gen_counts[v] = gen_counts.get(v, 0) + 1
for k, v in sorted(gen_counts.items(), key=lambda x: -x[1]):
    pr(f"  {k}: {v}")
pr()

# pre_familiarity
pr("### pre_familiarity (妖怪/伝承への馴染み 1-5)")
fam_counts = {}
for r in pre_answered:
    v = r.get('pre_familiarity', '(未回答)')
    fam_counts[v] = fam_counts.get(v, 0) + 1
fam_vals = []
for r in pre_answered:
    v = r.get('pre_familiarity')
    if v is not None:
        try:
            fam_vals.append(int(v))
        except (ValueError, TypeError):
            pass
if fam_vals:
    avg_fam = sum(fam_vals) / len(fam_vals)
    pr(f"  平均: {avg_fam:.2f}")
for k, v in sorted(fam_counts.items(), key=lambda x: str(x[0])):
    pr(f"  {k}: {v}")
pr()

# pre_ai_experience
pr("### pre_ai_experience (生成AI利用経験 1-5)")
ai_counts = {}
for r in pre_answered:
    v = r.get('pre_ai_experience', '(未回答)')
    ai_counts[v] = ai_counts.get(v, 0) + 1
ai_vals = []
for r in pre_answered:
    v = r.get('pre_ai_experience')
    if v is not None:
        try:
            ai_vals.append(int(v))
        except (ValueError, TypeError):
            pass
if ai_vals:
    avg_ai = sum(ai_vals) / len(ai_vals)
    pr(f"  平均: {avg_ai:.2f}")
for k, v in sorted(ai_counts.items(), key=lambda x: str(x[0])):
    pr(f"  {k}: {v}")
pr()

# pre_yokai_perception
pr("### pre_yokai_perception (事前の妖怪認識)")
perception_labels = {
    'character': 'アニメやゲームのキャラクター',
    'scary': '怖いもの',
    'culture': '土地にまつわる伝承的存在',
    'psychology': '人間がつけた名前',
    'spiritual': '神社仏閣に関係する存在',
    'none': '考えたことがない'
}
pre_perc_counts = {}
for r in pre_answered:
    v = r.get('pre_yokai_perception', '(未回答)')
    pre_perc_counts[v] = pre_perc_counts.get(v, 0) + 1
for k, v in sorted(pre_perc_counts.items(), key=lambda x: -x[1]):
    label = perception_labels.get(k, k)
    pr(f"  {k} ({label}): {v}")
pr()

# pre_image (自由記述)
pr("### pre_image (「妖怪」と聞いて最初に浮かぶイメージ)")
for r in pre_answered:
    img = r.get('pre_image', '')
    if img:
        pr(f"  - {img}")
pr()

# --- 2. Pre-Post 妖怪認識シフト (メインRQ) ---
pr("=" * 70)
pr("## 2. Pre-Post 妖怪認識シフト (PRIMARY MEASURE)")
pr()

paired = [r for r in completed if r.get('pre_yokai_perception') and r.get('post_yokai_perception')]
pr(f"有効ペア数: {len(paired)}")
pr()

if paired:
    # クロス集計
    cross = {}
    for r in paired:
        pre = r['pre_yokai_perception']
        post = r['post_yokai_perception']
        cross[(pre, post)] = cross.get((pre, post), 0) + 1
    
    pre_cats = sorted(set(r['pre_yokai_perception'] for r in paired))
    post_cats = sorted(set(r['post_yokai_perception'] for r in paired))
    all_cats = sorted(set(pre_cats + post_cats))
    
    pr("### クロス集計 (Pre → Post)")
    pre_post_label = 'Pre \\ Post'
    header = f"{pre_post_label:<15}" + "".join(f"{c:>12}" for c in all_cats) + f"{'Total':>8}"
    pr(header)
    pr("-" * len(header))
    for pre_c in all_cats:
        row_total = sum(cross.get((pre_c, post_c), 0) for post_c in all_cats)
        if row_total == 0:
            continue
        cells = "".join(f"{cross.get((pre_c, post_c), 0):>12}" for post_c in all_cats)
        pr(f"{pre_c:<15}{cells}{row_total:>8}")
    
    # Totals
    total_cells = "".join(f"{sum(cross.get((pre_c, post_c), 0) for pre_c in all_cats):>12}" for post_c in all_cats)
    pr(f"{'Total':<15}{total_cells}{len(paired):>8}")
    pr()
    
    # シフト率
    shifted = sum(1 for r in paired if r['pre_yokai_perception'] != r['post_yokai_perception'])
    pr(f"認識シフト率: {shifted}/{len(paired)} ({shifted/len(paired)*100:.1f}%)")
    pr()
    
    # 個別シフトの詳細
    pr("### 個別シフト詳細")
    for r in paired:
        pre = r['pre_yokai_perception']
        post = r['post_yokai_perception']
        changed = "★変化" if pre != post else "　維持"
        age = r.get('pre_age', '?')
        vtype = r.get('visitor_type', '?')
        pr(f"  {changed} | {pre:>12} → {post:<12} | {age}, {vtype}")
    pr()

    # culture/psychology への移行数
    culture_shift = sum(1 for r in paired 
                       if r['pre_yokai_perception'] not in ('culture', 'psychology')
                       and r['post_yokai_perception'] in ('culture', 'psychology'))
    pr(f"非文化的認識 → 文化的認識 (culture/psychology) への移行: {culture_shift}/{len(paired)}")
    pr()

# --- 3. Post-Survey 分析 ---
pr("=" * 70)
pr("## 3. Post-Survey 分析")
pr()

# post_theme (自由記述: この作品は何についてか)
pr("### post_theme (この作品は何についてだと思いましたか)")
for r in completed:
    theme = r.get('post_theme', '')
    if theme:
        pr(f"  - {theme}")
pr()

# post_impression (最も印象に残った場面)
pr("### post_impression (最も印象に残った場面や内容)")
for r in completed:
    imp = r.get('post_impression', '')
    if imp:
        pr(f"  - {imp}")
pr()

# post_selections (A-G forced choice)
pr("### post_selections (A-G forced-choice, 最大2つ)")
selection_map = {
    'A': 'C1: キャラクター消費 (妖怪をキャラクターとして鑑賞)',
    'B': 'C2: テクノロジー焦点 (AIで妖怪画像を作る)',
    'C': 'C3: 文化的固定 (地域の語りや場所と結びつく妖怪文化)',
    'D': 'C2-var: 観光PR (デジタル技術の観光利用)',
    'E': 'C4: 不安の外在化 (人間の不安や恐怖の可視化)',
    'F': 'C5: 儚い省察 (記憶や伝承の消えゆく性質)',
    'G': '不明 (よくわからない)'
}

sel_all = {}
for r in completed:
    sels = r.get('post_selections')
    if sels:
        # Supabase text[] はリストまたは文字列で来る
        if isinstance(sels, str):
            # "{A,C}" 形式
            sels = [s.strip().strip('{}"\' ') for s in sels.split(',')]
        for s in sels:
            s = s.strip()
            if s:
                sel_all[s] = sel_all.get(s, 0) + 1

for k, v in sorted(sel_all.items(), key=lambda x: -x[1]):
    label = selection_map.get(k, '?')
    pr(f"  {k} ({label}): {v}")
pr()

# post_action (行動意図 1-5)
pr("### post_action (帰宅後に伝承・怪談を調べたいか 1-5)")
act_counts = {}
for r in completed:
    v = r.get('post_action')
    if v is not None:
        act_counts[v] = act_counts.get(v, 0) + 1
act_vals = []
for r in completed:
    v = r.get('post_action')
    if v is not None:
        try:
            act_vals.append(int(v))
        except (ValueError, TypeError):
            pass
if act_vals:
    avg_act = sum(act_vals) / len(act_vals)
    pr(f"  平均: {avg_act:.2f}")
for k, v in sorted(act_counts.items()):
    pr(f"  {k}: {v}")
pr()

# post_yokai_perception
pr("### post_yokai_perception (体験後の妖怪認識)")
post_perception_labels = {
    'character': 'アニメやゲームのキャラクター',
    'scary': '怖い/不気味なもの',
    'culture': '地域/時代に根ざした文化的営み',
    'psychology': '人間が不安を形にしたもの',
    'spiritual': '目に見えない力',
    'none': '特に印象は変わらない'
}
post_perc_counts = {}
for r in completed:
    v = r.get('post_yokai_perception') or '(未回答)'
    post_perc_counts[v] = post_perc_counts.get(v, 0) + 1
for k, v in sorted(post_perc_counts.items(), key=lambda x: -x[1]):
    label = post_perception_labels.get(k, k)
    pr(f"  {k} ({label}): {v}")
pr()

# post_systems
pr("### post_systems (利用したシステム)")
sys_counts = {}
for r in completed:
    syss = r.get('post_systems')
    if syss:
        if isinstance(syss, str):
            syss = [s.strip().strip('{}"\' ') for s in syss.split(',')]
        for s in syss:
            s = s.strip()
            if s:
                sys_counts[s] = sys_counts.get(s, 0) + 1
for k, v in sorted(sys_counts.items(), key=lambda x: -x[1]):
    pr(f"  {k}: {v}")
pr()

# --- 4. 生成された妖怪たち ---
pr("=" * 70)
pr("## 4. 生成された妖怪")
pr()
for r in generated:
    name = r.get('yokai_name', '?')
    desc = r.get('yokai_desc', '')
    age = r.get('pre_age', '?')
    vtype = r.get('visitor_type', '?')
    pre_img = r.get('pre_image', '')
    pr(f"  【{name}】 ({age}, {vtype})")
    if desc:
        # 長すぎるdescは最初の100文字
        short = desc[:150] + ('…' if len(desc) > 150 else '')
        pr(f"    {short}")
    if pre_img:
        pr(f"    (事前イメージ: {pre_img})")
    pr()

# --- 5. 定性分析用ペア ---
pr("=" * 70)
pr("## 5. Pre-Image → Post-Theme ペア (定性分析用)")
pr()
for r in completed:
    pre_img = r.get('pre_image', '(未入力)')
    post_theme = r.get('post_theme', '(未入力)')
    post_imp = r.get('post_impression', '')
    yokai = r.get('yokai_name', '')
    pr(f"  Pre: {pre_img}")
    pr(f"  → Post Theme: {post_theme}")
    if post_imp:
        pr(f"  → Post Impression: {post_imp}")
    if yokai:
        pr(f"  → 生成妖怪: {yokai}")
    pr()

# --- レポートをファイルに保存 ---
report_path = output_dir / 'analysis_report.txt'
with open(report_path, 'w', encoding='utf-8') as f:
    f.write('\n'.join(lines))
print(f"\n=== レポート保存先: {report_path} ===")

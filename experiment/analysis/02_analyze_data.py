import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns
from pathlib import Path

# 日本語フォントの設定（Windows/Mac両対応の汎用設定）
plt.rcParams['font.family'] = 'sans-serif'
plt.rcParams['font.sans-serif'] = ['Hiragino Maru Gothic Pro', 'Yu Gothic', 'Meiryo', 'Takao', 'IPAexGothic', 'IPAPGothic', 'VL PGothic', 'Noto Sans CJK JP']

def analyze_data():
    """
    BAKEBAKE_XR: SIGGRAPH Art Paper 向けの初期データ分析スクリプト
    RQ: 参加者の「妖怪観」が体験前後でどう変容したか（キャラクター消費→文化的営みへの移行）
    """
    data_path = Path('../data/surveys_valid.csv')
    
    if not data_path.exists():
        print(f"Error: Data file not found at {data_path}")
        print("Please run 01_extract_data.py first.")
        return
        
    df = pd.read_csv(data_path)
    print(f"Loaded {len(df)} records for analysis.")
    
    # ---------------------------------------------------------
    # 1. 基礎集計 (Demographics & Pre-Familiarity)
    # ---------------------------------------------------------
    print("\n=== 1. 基礎集計 ===")
    print("【参加者属性 (visitor_type)】")
    print(df['visitor_type'].value_counts())
    print("\n【事前の妖怪への親しみ (pre_familiarity)】")
    print(df['pre_familiarity'].value_counts())
    print("\n【年齢層 (pre_age)】")
    print(df['pre_age'].value_counts())
    
    # ---------------------------------------------------------
    # 2. 🔴 Pre-Post 妖怪知覚シフト（メインRQ定量指標）
    # ---------------------------------------------------------
    print("\n=== 2. Pre-Post 妖怪知覚シフト (PRIMARY MEASURE) ===")
    if 'post_yokai_perception' in df.columns:
        shift_df = df[['pre_yokai_perception', 'post_yokai_perception']].dropna()
        print(f"有効ペア数: {len(shift_df)}")
        
        # クロス集計
        cross = pd.crosstab(
            shift_df['pre_yokai_perception'], 
            shift_df['post_yokai_perception'],
            margins=True
        )
        print("\n【Pre→Post クロス集計】")
        print(cross)
        
        # シフト率
        shifted = (shift_df['pre_yokai_perception'] != shift_df['post_yokai_perception']).sum()
        print(f"\n認識シフト率: {shifted}/{len(shift_df)} ({shifted/len(shift_df)*100:.1f}%)")
        
        # 年代別クロス集計
        if 'pre_age' in df.columns:
            print("\n【年代別シフト率】")
            age_shift = df[['pre_age', 'pre_yokai_perception', 'post_yokai_perception']].dropna()
            for age_group in age_shift['pre_age'].unique():
                subset = age_shift[age_shift['pre_age'] == age_group]
                s = (subset['pre_yokai_perception'] != subset['post_yokai_perception']).sum()
                print(f"  {age_group}: {s}/{len(subset)} ({s/len(subset)*100:.1f}%)")
    else:
        print("post_yokai_perception カラムが存在しません。")
    
    # ---------------------------------------------------------
    # 3. 生成された妖怪と選択されたテクスチャの傾向
    # ---------------------------------------------------------
    print("\n=== 3. 生成傾向 ===")
    if 'texture' in df.columns:
        print("【選ばれた質感 (texture)】")
        print(df['texture'].value_counts().head(5))
    
    # ---------------------------------------------------------
    # 4. 体験後の解釈 (Forced-Choice A-G) - SIGGRAPH 向けの定量データ
    # ---------------------------------------------------------
    print("\n=== 4. 体験後の解釈 (post_selections A-G) ===")
    # A-G → C1-C5 マッピング
    selection_map = {
        'A': 'C1 (Character Consumption)',
        'B': 'C2 (Technology Focus)',
        'C': 'C3 (Cultural Anchoring)',
        'D': 'C2-variant (Tourism/PR)',
        'E': 'C4 (Anxiety Externalization)',
        'F': 'C5 (Ephemeral Reflection)',
        'G': 'Unclear'
    }
    
    if 'post_selections' in df.columns:
        # post_selections は text[] なので展開
        all_selections = df['post_selections'].dropna().explode()
        sel_counts = all_selections.value_counts()
        print("【選択分布】")
        for val, count in sel_counts.items():
            mapped = selection_map.get(str(val).strip("{}' "), '?')
            print(f"  {val} ({mapped}): {count}")
    
    # ---------------------------------------------------------
    # 5. 体験後の自由記述 (Reflexive Thematic Analysis の準備)
    # ---------------------------------------------------------
    print("\n=== 5. 定性分析の準備 (Qualitative Data) ===")
    print("事前イメージ (pre_image) と 事後感想 (post_impression) のペアを抽出しました。")
    
    qualitative_df = df[['id', 'pre_image', 'post_impression']].dropna()
    qualitative_path = 'qualitative_pairs.csv'
    qualitative_df.to_csv(qualitative_path, index=False, encoding='utf-8-sig')
    print(f"Exported {len(qualitative_df)} pairs to -> {qualitative_path}")
    
    # LLM用プロンプトの生成ヘルパー
    print("\n[Thematic Analysis Prompt Template for LLM]")
    print('''
以下のCSVは、参加者の「体験前の妖怪のイメージ」と「体験後の作品の感想」のペアです。
SIGGRAPH Art Paper の Evaluation として、参加者の認識が以下のように変容したか（Affective Shift）を分析してください。

[コーディング軸]
- C1 (Character Consumption): 妖怪を単なるポップカルチャーのキャラクターとして消費したままである
- C2 (Technology Focus): デジタル技術（AI/VR）の目新しさに驚いている
- C3 (Cultural Anchoring): 妖怪を「地域や語りと結びつく文化的営み」として再解釈した
- C4 (Anxiety Externalization): 妖怪を「人間の不安や恐怖の具現化」（名づけの実践）として再解釈した
- C5 (Ephemeral Reflection): 感熱紙の儚さや物質性に言及し、記憶や伝承の性質と結びつけている

各回答を上記の軸で分類し、RQ「本展示は妖怪の認識をキャラクター消費から文化的営みへと移行させたか？」に対する結論をサマリーしてください。
    ''')

if __name__ == "__main__":
    analyze_data()

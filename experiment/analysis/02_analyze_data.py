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
    RQ1/RQ2: 参加者の「妖怪観」が体験前後でどう変容したか（キャラクター消費→文化的営みへの移行）
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
    
    # ---------------------------------------------------------
    # 2. 生成された妖怪と選択されたテクスチャの傾向
    # ---------------------------------------------------------
    print("\n=== 2. 生成傾向 ===")
    print("【選ばれた質感 (texture)】")
    print(df['texture'].value_counts().head(5))
    
    # ---------------------------------------------------------
    # 3. 体験後の解釈 (Thematic Shifts) - SIGGRAPH 向けの最重要データ
    # ---------------------------------------------------------
    print("\n=== 3. 体験後の解釈 (post_theme) ===")
    # post_theme は「何についての作品だと思いましたか？」の回答
    theme_counts = df['post_theme'].value_counts()
    print(theme_counts)
    
    # 可視化: 参加者の作品解釈の分布
    plt.figure(figsize=(10, 6))
    sns.countplot(y='post_theme', data=df, order=df['post_theme'].value_counts().index, palette='viridis')
    plt.title('Distribution of Post-Experience Thematic Interpretation\n(RQ: Shift from Character to Cultural Phenomenon)', pad=20)
    plt.xlabel('Number of Participants')
    plt.ylabel('Selected Theme')
    plt.tight_layout()
    plt.savefig('post_theme_distribution.png')
    print("Saved plot -> post_theme_distribution.png")
    
    # ---------------------------------------------------------
    # 4. 自由記述 (Reflexive Thematic Analysis の準備)
    # ---------------------------------------------------------
    print("\n=== 4. 定性分析の準備 (Qualitative Data) ===")
    print("事前イメージ (pre_image) と 事後感想 (post_impression) のペアを抽出しました。")
    print("※これをLLM（Gemini/OpenAI）に投げて、感情の変容（Affective Shift）をコーディングしてください。")
    
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
- C1 (Negative): 妖怪を単なるポップカルチャーのキャラクターとして消費したままである
- C2 (Positive): デジタル技術（AI/VR）の目新しさに驚いている
- C3 (Core Success): 妖怪を「自身の不安」や「見えない気配」の具現化（文化的営み）として再解釈した
- C4 (Core Success): 感熱紙（レシート）の儚さや物質性（Tangibility）に言及し、記憶や伝承の性質と結びつけている

各回答を上記の軸で分類し、RQ「本展示は妖怪の認識をキャラクター消費から文化的営みへと移行させたか？」に対する結論をサマリーしてください。
    ''')

if __name__ == "__main__":
    analyze_data()

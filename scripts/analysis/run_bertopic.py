"""
妖怪テキストの BERTopic 分析パイプライン

Phase A: オフライン研究分析（ローカル実行）

入力: data/raw-folklore.json (1,038体の妖怪テキスト)
出力:
  - data/yokai-clusters.json     (妖怪→クラスタ割当)
  - data/cluster-labels.json     (クラスタ→メタデータ)
  - data/topic-embeddings.npy    (トピック重心, 研究用)
  - data/analysis/               (可視化PNG/HTML)

Usage:
  cd yokai
  pip install -r scripts/analysis/requirements.txt
  python scripts/analysis/run_bertopic.py
"""

import json
import os
import sys
from pathlib import Path

import MeCab
import numpy as np
from bertopic import BERTopic
from sentence_transformers import SentenceTransformer
from sklearn.feature_extraction.text import CountVectorizer
from umap import UMAP
from hdbscan import HDBSCAN

# ============================================================
# 設定
# ============================================================

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = PROJECT_ROOT / "data"
INPUT_FILE = DATA_DIR / "raw-folklore.json"
OUTPUT_DIR = DATA_DIR / "analysis"

# 埋め込みモデル: 日本語性能が高い多言語モデル
EMBEDDING_MODEL = "intfloat/multilingual-e5-large"

# BERTopic パラメータ
UMAP_N_NEIGHBORS = 15
UMAP_N_COMPONENTS = 5        # 1038文書なので低めに
UMAP_MIN_DIST = 0.0
HDBSCAN_MIN_CLUSTER_SIZE = 5  # 最小クラスタサイズ
HDBSCAN_MIN_SAMPLES = 3

# ============================================================
# ユーティリティ
# ============================================================

def load_folklore() -> list[dict]:
    """raw-folklore.json から妖怪データを読み込み"""
    with open(INPUT_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)
    entries = data["entries"]
    print(f"読み込み完了: {len(entries)} 体の妖怪")
    return entries


def build_documents(entries: list[dict]) -> tuple[list[str], list[str]]:
    """
    妖怪エントリから BERTopic 用の文書リストを構築。
    各文書 = 名前 + 要約（検索用のテキスト情報）

    multilingual-e5 は "passage: " プレフィックスが推奨
    """
    docs = []
    names = []
    for e in entries:
        text = f"{e['name']}。{e['summary']}"
        docs.append(f"passage: {text}")
        names.append(e["name"])
    return docs, names


def create_mecab_vectorizer() -> CountVectorizer:
    """MeCab 分かち書きを用いた CountVectorizer を構築"""
    wakati = MeCab.Tagger("-Owakati")

    def mecab_tokenizer(text: str) -> list[str]:
        # "passage: " プレフィックスを除去してからトークン化
        clean = text.replace("passage: ", "")
        parsed = wakati.parse(clean)
        if parsed is None:
            return []
        tokens = parsed.strip().split()
        # 1文字の助詞・助動詞など短いトークンを除外
        return [t for t in tokens if len(t) > 1]

    return CountVectorizer(
        tokenizer=mecab_tokenizer,
        max_features=5000,
        min_df=2,
        max_df=0.95,
    )


# ============================================================
# メインパイプライン
# ============================================================

def main():
    print("=" * 60)
    print("妖怪テキスト BERTopic 分析")
    print("=" * 60)

    # 出力ディレクトリ作成
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # 1. データ読み込み
    print("\n[1/6] データ読み込み...")
    entries = load_folklore()
    docs, names = build_documents(entries)

    # 2. 埋め込みモデルロード
    print(f"\n[2/6] 埋め込みモデルロード: {EMBEDDING_MODEL}")
    print("  (初回は ~2GB ダウンロード、数分かかります)")
    embedding_model = SentenceTransformer(EMBEDDING_MODEL)

    # 3. 埋め込み計算
    print("\n[3/6] 文書埋め込み計算中...")
    embeddings = embedding_model.encode(
        docs,
        show_progress_bar=True,
        batch_size=32,
        normalize_embeddings=True,
    )
    print(f"  埋め込み形状: {embeddings.shape}")  # (1038, 1024)

    # 埋め込みを保存（再実行時に使えるように）
    np.save(OUTPUT_DIR / "document-embeddings.npy", embeddings)
    print(f"  保存: {OUTPUT_DIR / 'document-embeddings.npy'}")

    # 4. BERTopic モデル構築
    print("\n[4/6] BERTopic モデル構築...")
    umap_model = UMAP(
        n_neighbors=UMAP_N_NEIGHBORS,
        n_components=UMAP_N_COMPONENTS,
        min_dist=UMAP_MIN_DIST,
        metric="cosine",
        random_state=42,
    )
    hdbscan_model = HDBSCAN(
        min_cluster_size=HDBSCAN_MIN_CLUSTER_SIZE,
        min_samples=HDBSCAN_MIN_SAMPLES,
        metric="euclidean",
        prediction_data=True,
    )
    vectorizer = create_mecab_vectorizer()

    topic_model = BERTopic(
        embedding_model=embedding_model,
        umap_model=umap_model,
        hdbscan_model=hdbscan_model,
        vectorizer_model=vectorizer,
        top_n_words=10,
        verbose=True,
    )

    # 5. トピック抽出
    print("\n[5/6] トピック抽出中...")
    topics, probs = topic_model.fit_transform(docs, embeddings)

    # 結果サマリ
    topic_info = topic_model.get_topic_info()
    n_topics = len(topic_info) - 1  # -1 はアウトライヤー
    n_outliers = sum(1 for t in topics if t == -1)

    print(f"\n  発見トピック数: {n_topics}")
    print(f"  アウトライヤー: {n_outliers} / {len(topics)}")
    print(f"\n  トピック一覧:")
    for _, row in topic_info.iterrows():
        tid = row["Topic"]
        count = row["Count"]
        rep = row.get("Representation", row.get("Name", ""))
        if isinstance(rep, list):
            rep = ", ".join(rep[:5])
        print(f"    Topic {tid:3d}: {count:4d} 体 | {rep}")

    # 6. エクスポート
    print("\n[6/6] 結果エクスポート...")
    export_results(topic_model, topics, probs, entries, names, embeddings)

    # 可視化
    print("\n可視化生成中...")
    generate_visualizations(topic_model, docs, embeddings, topics, names)

    print("\n" + "=" * 60)
    print("完了!")
    print(f"出力ディレクトリ: {OUTPUT_DIR}")
    print("=" * 60)


def export_results(
    model: BERTopic,
    topics: list[int],
    probs,
    entries: list[dict],
    names: list[str],
    embeddings,
):
    """クラスタ結果をJSON形式でエクスポート"""

    # yokai-clusters.json: 妖怪 → クラスタ割当
    yokai_clusters = []
    for i, entry in enumerate(entries):
        yokai_clusters.append({
            "id": entry["id"],
            "name": entry["name"],
            "summary": entry["summary"],
            "location": entry["location"],
            "clusterId": int(topics[i]),
            "confidence": float(probs[i]) if probs is not None and len(probs.shape) == 1 else None,
        })

    with open(DATA_DIR / "yokai-clusters.json", "w", encoding="utf-8") as f:
        json.dump({"yokai": yokai_clusters}, f, ensure_ascii=False, indent=2)
    print(f"  保存: {DATA_DIR / 'yokai-clusters.json'}")

    # cluster-labels.json: クラスタ → メタデータ
    topic_info = model.get_topic_info()
    cluster_labels = {}
    for _, row in topic_info.iterrows():
        tid = int(row["Topic"])
        if tid == -1:
            continue  # アウトライヤーはスキップ

        # そのトピックに属する妖怪名を取得
        topic_yokai = [names[i] for i, t in enumerate(topics) if t == tid]

        # 代表語
        topic_words = model.get_topic(tid)
        rep_words = [word for word, _ in topic_words[:10]] if topic_words else []

        cluster_labels[str(tid)] = {
            "id": tid,
            "size": int(row["Count"]),
            "representativeWords": rep_words,
            "representativeYokai": topic_yokai[:5],
            "allYokai": topic_yokai,
            "label": "",  # 手動でラベル付けする用
        }

    with open(DATA_DIR / "cluster-labels.json", "w", encoding="utf-8") as f:
        json.dump({"clusters": cluster_labels}, f, ensure_ascii=False, indent=2)
    print(f"  保存: {DATA_DIR / 'cluster-labels.json'}")

    # トピック埋め込み（重心）を保存
    topic_embeddings = model.topic_embeddings_
    if topic_embeddings is not None:
        np.save(OUTPUT_DIR / "topic-embeddings.npy", topic_embeddings)
        print(f"  保存: {OUTPUT_DIR / 'topic-embeddings.npy'}")


def generate_visualizations(
    model: BERTopic,
    docs: list[str],
    embeddings,
    topics: list[int],
    names: list[str],
):
    """可視化を生成して保存"""
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    # 1. トピック棒グラフ
    try:
        fig = model.visualize_barchart(top_n_topics=20, n_words=8)
        fig.write_html(str(OUTPUT_DIR / "topic_barchart.html"))
        fig.write_image(str(OUTPUT_DIR / "topic_barchart.png"), width=1200, height=800)
        print(f"  保存: topic_barchart.html/png")
    except Exception as e:
        print(f"  棒グラフ生成失敗: {e}")

    # 2. UMAP 2Dマップ
    try:
        # 2D UMAPを別途計算
        umap_2d = UMAP(
            n_components=2,
            n_neighbors=15,
            min_dist=0.1,
            metric="cosine",
            random_state=42,
        )
        coords_2d = umap_2d.fit_transform(embeddings)

        # matplotlibで散布図
        fig, ax = plt.subplots(figsize=(14, 10))
        unique_topics = sorted(set(topics))
        colors = plt.cm.tab20(np.linspace(0, 1, len(unique_topics)))

        for idx, tid in enumerate(unique_topics):
            mask = [i for i, t in enumerate(topics) if t == tid]
            label = f"Topic {tid}" if tid != -1 else "Outlier"
            alpha = 0.3 if tid == -1 else 0.7
            ax.scatter(
                coords_2d[mask, 0],
                coords_2d[mask, 1],
                c=[colors[idx]],
                label=label,
                alpha=alpha,
                s=20,
            )
            # 代表的な妖怪名をプロット
            if tid != -1:
                for i in mask[:3]:
                    ax.annotate(
                        names[i],
                        (coords_2d[i, 0], coords_2d[i, 1]),
                        fontsize=7,
                        alpha=0.8,
                    )

        ax.set_title("妖怪テキスト UMAP 2D投影 (BERTopic クラスタ)", fontsize=14)
        ax.legend(bbox_to_anchor=(1.05, 1), loc="upper left", fontsize=8)
        plt.tight_layout()
        plt.savefig(OUTPUT_DIR / "umap_scatter.png", dpi=150)
        plt.close()
        print(f"  保存: umap_scatter.png")
    except Exception as e:
        print(f"  UMAPマップ生成失敗: {e}")

    # 3. トピック間類似度ヒートマップ
    try:
        fig = model.visualize_heatmap()
        fig.write_html(str(OUTPUT_DIR / "topic_heatmap.html"))
        fig.write_image(str(OUTPUT_DIR / "topic_heatmap.png"), width=800, height=800)
        print(f"  保存: topic_heatmap.html/png")
    except Exception as e:
        print(f"  ヒートマップ生成失敗: {e}")

    # 4. トピック階層図
    try:
        fig = model.visualize_hierarchy()
        fig.write_html(str(OUTPUT_DIR / "topic_hierarchy.html"))
        fig.write_image(str(OUTPUT_DIR / "topic_hierarchy.png"), width=1200, height=600)
        print(f"  保存: topic_hierarchy.html/png")
    except Exception as e:
        print(f"  階層図生成失敗: {e}")


if __name__ == "__main__":
    main()

#!/usr/bin/env bash
# ============================================================
# Phase A 実行スクリプト: 妖怪BERTopic分析パイプライン
#
# Usage: bash scripts/analysis/run.sh
#
# このスクリプトは以下を自動実行:
#   1. venv の作成（初回のみ）
#   2. 依存パッケージのインストール
#   3. データ取得（raw-folklore.json がなければ）
#   4. BERTopic 分析実行
# ============================================================

set -e
cd "$(dirname "$0")/../.."

echo "============================================================"
echo " Phase A: 妖怪テキスト BERTopic 分析"
echo "============================================================"

# --- Step 1: venv ---
if [ ! -d ".venv-analysis" ]; then
    echo "[1/4] venv 作成中..."
    python3 -m venv .venv-analysis
else
    echo "[1/4] venv 検出済み"
fi

source .venv-analysis/bin/activate
echo "  Python: $(python --version)"

# --- Step 2: 依存パッケージ ---
echo ""
echo "[2/4] 依存パッケージ確認中..."
pip install -r scripts/analysis/requirements.txt --quiet

# --- Step 3: データ確認 ---
echo ""
if [ ! -f "data/raw-folklore.json" ]; then
    echo "[3/4] データ取得中（YokaiEval）..."
    npx tsx scripts/scrape-yokai-db.ts
else
    echo "[3/4] データ検出済み: data/raw-folklore.json"
fi

# --- Step 4: BERTopic 分析 ---
echo ""
echo "[4/4] BERTopic 分析実行中..."
echo "  (初回はモデルダウンロード ~2GB, 数分かかります)"
echo ""
python scripts/analysis/run_bertopic.py

echo ""
echo "============================================================"
echo " 完了! 出力: data/analysis/"
echo "============================================================"

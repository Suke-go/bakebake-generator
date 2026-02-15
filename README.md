# 妖怪生成システム

妖怪の伝承データを分析し、創造性支援に活用するプロジェクト。

## 構成

```
src/              Next.js アプリ (Gemini API 連携)
  app/            ページ + API routes
  components/     UI コンポーネント (Phase 0-3)
  lib/            ユーティリティ (folklore-search, prompt-builder, etc.)
scripts/
  scrape-yokai-db.ts       YokaiEval データ取得
  compute-embeddings.ts    Gemini embedding 計算
  analysis/                BERTopic + 名前構造分解
data/
  raw-folklore.json        YokaiEval 1,038体
  cluster-labels.json      BERTopic 61クラスタ
  yokai-clusters.json      クラスタ割り当て詳細
  analysis/                分析出力 (gitignore: .npy, .html)
```

## セットアップ

```bash
npm install
cp .env.local.example .env.local  # GEMINI_API_KEY を設定
npm run dev
```

## 分析スクリプト

```bash
# BERTopic (Python venv 必要)
cd scripts/analysis && ./run.sh   # or run.bat

# 名前構造分解
python scripts/analysis/analyze_name_structure.py

# 日文研DB交差分析
$env:PYTHONIOENCODING='utf-8'; python -u scripts/analysis/nichibunken_cross.py
```

## データソース

- [CyberAgentAILab/YokaiEval](https://github.com/CyberAgentAILab/YokaiEval) (Wikipedia ベース, 1,038体)
- [怪異・妖怪伝承DB](https://www.nichibun.ac.jp/YoukaiDB/) (日文研, 35,307件)

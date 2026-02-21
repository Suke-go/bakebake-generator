# 妖怪生成システム (BAKEBAKE_XR)

妖怪の伝承データを分析し、創造性支援に活用するプロジェクト。
展示来場者の体験談から Gemini API を用いて妖怪の物語・画像を生成し、お札型チケットとして印刷する。

## 構成

```
src/                        Next.js アプリ (Gemini API 連携)
  app/
    page.tsx                メインページ (Phase 0–3 体験フロー)
    globals.css             グローバルスタイル
    api/
      search-folklore/      伝承ベクトル検索 API
      generate-concepts/    妖怪コンセプト生成 API
      generate-image/       妖怪画像生成 API
      local-print/          ローカル印刷トリガー API
    survey/
      enter/                アンケート入口 (同意画面 → フォーム)
      scan/                 QRコードスキャン画面
      ticket/[id]/          お札チケット表示画面
      exit/                 完了画面
    admin/                  管理画面
    generator/              生成画面
  components/               UI コンポーネント (Phase 0–3, エフェクト系)
  lib/
    api-client.ts           API クライアント
    art-styles.ts           画風プリセット定義
    context.tsx             アプリ状態管理 (React Context)
    data.ts                 アンケート選択肢データ
    folklore-search.ts      伝承検索ロジック
    genai-utils.ts          Gemini API ユーティリティ (フォールバック対応)
    prompt-builder.ts       プロンプト生成
    supabase.ts             Supabase クライアント

scripts/
  scrape-yokai-db.ts        YokaiEval データ取得
  compute-embeddings.ts     Gemini embedding 計算
  generate-qr.mjs           QRコード SVG/HTML 生成
  smoke-phase3.mjs          Phase3 スモークテスト
  upload-to-blob.ts         Vercel Blob アップロード
  analysis/                 BERTopic + 名前構造分析 (Python)
  yokai-print-server/       ローカル印刷デーモン (Python)

data/
  raw-folklore.json          YokaiEval 1,038件
  cluster-labels.json        BERTopic 61クラスタ
  yokai-clusters.json        クラスタ割り当て詳細
  folklore-embeddings.json   伝承ベクトル埋め込み
  embedding-progress.json    埋め込み計算進捗
  analysis/                  分析出力 (.npy, .html など、gitignore 対象)

experiment/                  SIGGRAPH 2026 展示評価データ
  data/                      Supabase エクスポート CSV
  analysis/                  Python 分析パイプライン

paper/                       SIGGRAPH Asia 2026 Art Paper
  drafts/                    LaTeX 原稿
  figures/                   図表・システム図

public/                      静的アセット
  image/yokai/               妖怪画像素材
  label.png                  お札背景画像
  qr-survey-enter.*          アンケート入口 QRコード

supabase/
  schema.sql                 データベーススキーマ定義
```

## セットアップ

```bash
npm install
cp .env.local.example .env.local  # GEMINI_API_KEY を設定
npm run dev
```

### Phase3 スモークテスト

```bash
npm run dev

# 別ターミナル
npm run test:phase3-smoke
```

`.env.local` の `GEMINI_API_KEY` をそのまま使い、`/api/search-folklore`・`/api/generate-concepts`・`/api/generate-image` に繋がります。

## 分析スクリプト

```bash
# BERTopic (Python venv 必要)
cd scripts/analysis && ./run.sh   # or run.bat

# 名前構造分析
python scripts/analysis/analyze_name_structure.py

# 日文研 DB 交差分析
$env:PYTHONIOENCODING='utf-8'; python -u scripts/analysis/nichibunken_cross.py
```

## 印刷デーモン

```bash
cd scripts/yokai-print-server
pip install -r requirements.txt
python print_daemon.py
```

## データソース

- [CyberAgentAILab/YokaiEval](https://github.com/CyberAgentAILab/YokaiEval) (Wikipedia ベース, 1,038件)
- [怪異・妖怪伝承DB](https://www.nichibun.ac.jp/YoukaiDB/) (日文研, 35,307件)

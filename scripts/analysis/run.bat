@echo off
REM ============================================================
REM Phase A 実行スクリプト: 妖怪BERTopic分析パイプライン
REM
REM Usage: scripts\analysis\run.bat
REM
REM このスクリプトは以下を自動実行:
REM   1. venv の作成（初回のみ）
REM   2. 依存パッケージのインストール
REM   3. データ取得（raw-folklore.json がなければ）
REM   4. BERTopic 分析実行
REM ============================================================

cd /d "%~dp0\..\.."
echo ============================================================
echo  Phase A: 妖怪テキスト BERTopic 分析
echo ============================================================

REM --- Step 1: venv ---
if not exist ".venv-analysis\Scripts\activate.bat" (
    echo [1/4] venv 作成中...
    python -m venv .venv-analysis
) else (
    echo [1/4] venv 検出済み
)

call .venv-analysis\Scripts\activate.bat
echo   Python: 
python --version

REM --- Step 2: 依存パッケージ ---
echo.
echo [2/4] 依存パッケージ確認中...
pip install -r scripts\analysis\requirements.txt --quiet

REM --- Step 3: データ確認 ---
echo.
if not exist "data\raw-folklore.json" (
    echo [3/4] データ取得中（YokaiEval）...
    npx tsx scripts\scrape-yokai-db.ts
) else (
    echo [3/4] データ検出済み: data\raw-folklore.json
)

REM --- Step 4: BERTopic 分析 ---
echo.
echo [4/4] BERTopic 分析実行中...
echo   (初回はモデルダウンロード ~2GB, 数分かかります)
echo.
python scripts\analysis\run_bertopic.py

echo.
echo ============================================================
echo  完了! 出力: data\analysis\
echo ============================================================
pause

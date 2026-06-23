# 学術論文

BAKEBAKE_XR プロジェクトに関する学術論文のソースファイル。

## ディレクトリ構成

```
paper/
  ipm/                       IP&M 投稿 (主圏論的文化分析)
    main.tex                 原稿本体
    refs.bib                 参考文献
    supplementary.tex        補足資料
    title_page.tex           表紙
    cover_letter.tex         カバーレター
    figures/                 図表
    generate_figures.py      図表生成スクリプト
    convert_bib.py           文献変換スクリプト
    IPM_package_20260226/    投稿パッケージ

  cultural-analytics/        Cultural Analytics 投稿 (構造バイアス分析)
    main.tex                 英語原稿
    main_ja.tex              日本語原稿

  foss4g-yokai-geo/          FOSS4G 向け妖怪地理パイプライン論文
    main.tex                 原稿
    main.pdf                 コンパイル済み PDF
    refs.bib                 参考文献
    system_design.md         システム設計メモ

  isprs-yokai-geo/           ISPRS 向け地理的支持モデル論文
    main.tex                 原稿
    main.pdf                 コンパイル済み PDF
    refs.bib                 参考文献
    figures/                 分析図表

  siggraph/                  SIGGRAPH Art Paper
    siggraph_art_paper_draft.tex  原稿
    figures/                 図表・展示写真 (EXPO)

  drafts/                    旧ドラフト
    shuken_base_paper.tex    主圏論ベース論文
    figures/                 図表 (TDA, shuken)
```

## ビルド

各サブディレクトリ内で `latexmk` または `lualatex` を実行。
LaTeX ビルド成果物 (`.aux`, `.log` 等) は `.gitignore` 対象。

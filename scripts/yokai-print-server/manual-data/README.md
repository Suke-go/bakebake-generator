# manual-data/

手動レシート生成用のデータ格納ディレクトリ。

## 構成

各ユーザーごとにサブフォルダを作り、写真と伝承テキストを配置してください。

```
manual-data/
├── 001/
│   ├── photo.jpg      ← ユーザーの写真
│   └── lore.txt       ← 妖怪名(1行目) + 伝承テキスト(2行目以降)
├── 002/
│   ├── photo.png
│   └── lore.txt
└── ...
```

### lore.txt のフォーマット

```
夜泣き石
山中に佇む石の妖怪。夜になると泣き声を上げるという。
旅人がこの石の前を通ると、足が動かなくなると伝えられている。
```

- **1行目**: 妖怪の名前
- **2行目以降**: 伝承テキスト（改行は結合されます）

## 一括印刷

```bash
python batch_print.py manual-data/001
```

または `manual_receipt.py` で個別に:

```bash
python manual_receipt.py manual-data/001/photo.jpg --name "夜泣き石" --desc "山中に佇む石の妖怪。"
```

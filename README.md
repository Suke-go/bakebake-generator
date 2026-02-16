# 螯匁ｪ逕滓・繧ｷ繧ｹ繝・Β

螯匁ｪ縺ｮ莨晄価繝・・繧ｿ繧貞・譫舌＠縲∝卸騾諤ｧ謾ｯ謠ｴ縺ｫ豢ｻ逕ｨ縺吶ｋ繝励Ο繧ｸ繧ｧ繧ｯ繝医・
## 讒区・

```
src/              Next.js 繧｢繝励Μ (Gemini API 騾｣謳ｺ)
  app/            繝壹・繧ｸ + API routes
  components/     UI 繧ｳ繝ｳ繝昴・繝阪Φ繝・(Phase 0-3)
  lib/            繝ｦ繝ｼ繝・ぅ繝ｪ繝・ぅ (folklore-search, prompt-builder, etc.)
scripts/
  scrape-yokai-db.ts       YokaiEval 繝・・繧ｿ蜿門ｾ・  compute-embeddings.ts    Gemini embedding 險育ｮ・  analysis/                BERTopic + 蜷榊燕讒矩蛻・ｧ｣
data/
  raw-folklore.json        YokaiEval 1,038菴・  cluster-labels.json      BERTopic 61繧ｯ繝ｩ繧ｹ繧ｿ
  yokai-clusters.json      繧ｯ繝ｩ繧ｹ繧ｿ蜑ｲ繧雁ｽ薙※隧ｳ邏ｰ
  analysis/                蛻・梵蜃ｺ蜉・(gitignore: .npy, .html)
```

## 繧ｻ繝・ヨ繧｢繝・・

```bash
npm install
cp .env.local.example .env.local  # GEMINI_API_KEY 繧定ｨｭ螳・npm run dev
```


### Phase3スモークテスト（env.local利用）

`ash
npm run dev

# 別ターミナル
npm run test:phase3-smoke
`

.env.local の GEMINI_API_KEY をそのまま使い、/api/search-folklore → /api/generate-concepts → /api/generate-image を順に検証します。
## 蛻・梵繧ｹ繧ｯ繝ｪ繝励ヨ

```bash
# BERTopic (Python venv 蠢・ｦ・
cd scripts/analysis && ./run.sh   # or run.bat

# 蜷榊燕讒矩蛻・ｧ｣
python scripts/analysis/analyze_name_structure.py

# 譌･譁・妊B莠､蟾ｮ蛻・梵
$env:PYTHONIOENCODING='utf-8'; python -u scripts/analysis/nichibunken_cross.py
```

## 繝・・繧ｿ繧ｽ繝ｼ繧ｹ

- [CyberAgentAILab/YokaiEval](https://github.com/CyberAgentAILab/YokaiEval) (Wikipedia 繝吶・繧ｹ, 1,038菴・
- [諤ｪ逡ｰ繝ｻ螯匁ｪ莨晄価DB](https://www.nichibun.ac.jp/YoukaiDB/) (譌･譁・・ 35,307莉ｶ)



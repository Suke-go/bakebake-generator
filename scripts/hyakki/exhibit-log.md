# 百鬼夜行・展示研究の操作記録

対象は `/hyakki/exp` で同意して遊び、最後に「回答を送る」を押したセッション。通常版と未送信のプレイは集計外。単位は匿名の回答IDで、同一人物の再訪や同伴者の人数は判別できない。

## 取得と集計

Supabaseの研究用アカウントから次の読み取りクエリを実行すると、操作を1行ずつCSV出力できる。同じ回答IDで質問紙・自由記述に結合する。カードIDは展示時点の `data/hyakki/units.json` の `id` に対応し、一行の文は同じ版の `texts.json` に `key` で結合する。解析時にデータと実装のGitコミットを記録する。

```sql
select r.id as response_id, e.seq, (e.item->>'ms')::bigint as elapsed_ms,
       (e.item->>'stage')::int as screen, e.item->>'kind' as event,
       e.item->'ids' as card_ids, (r.payload#>>'{log,trace,dropped}')::int as omitted
from public.hyakki_exp_responses r
cross join lateral jsonb_array_elements(r.payload#>'{log,trace,events}')
  with ordinality as e(item, seq)
where r.version = 'hyakki-exhibit-v2' and r.payload#>>'{log,trace,version}' = '1'
order by r.id, e.seq;
```

時刻はゲームの初期画面からの経過ミリ秒。同時刻は配列順で読む。バックグラウンド時間を含むため、滞在時間を算出する場合は `page_hidden` から `page_visible` までを除外する。旧回答の trace 欠損は未計測。上限1,200イベントを超えたセッションは先頭から保存し、`dropped` に省略件数を記録する。完結した時系列を要する分析では省略ありを除く。離脱率の分母には使えない。

| イベント | 意味 |
|---|---|
| stage | 画面の切替。0 導入、1 地方、2 町、3 最初の一体、4 雲探索、5 手がかり、6 正体、7 召喚準備、8 呼びかけ、9 行列、10 絵巻。ほかのイベントの screen は発生時の画面。 |
| replay / reduced_motion | 5体指定URLからの再現、または動きを減らす設定の有効化。通常プレイの演出分析では区別する。 |
| pin_pick / map_drag | 地図上の地点選択、またはポインター移動が6pxを超えた操作。座標と軌跡は保存しない。 |
| starters_offered / mists_offered | 初期候補または更新後の雲候補のID一覧。画面外の候補も含む。 |
| tease_shown / echo_shown | 地図が一行の吹き出しを生成、または応答の文字を表示状態にした。視線・読了は計測していない。 |
| peek / peek_again | 雲を開いた操作と、既にのぞいた雲をパネルで選び直した操作。繰り返しも保持。 |
| invite / revealed | 誘う操作と、雲の正体の取得成功。最初の一体は名前が先に提示されるため revealed は発生しない。最終的に選ばれた5体は log.chosen。 |
| caller / skip_call / skip_parade | 手動で呼びかけた妖怪、または各演出のスキップ。log.offeredEchoIds はその回で応答可能だった集合。 |
| scroll_open / scroll_close | 絵巻で開いたカードと、とじる操作。scroll_open は取得成功時に記録する。 |
| story_link / image_link / download_request | 典拠リンクのクリック、または画像保存の要求。外部サイトの閲覧時間や端末への保存完了は不明。 |
| finish | 絵巻の「遊びを終える」を押した時点。質問紙への回答時間は含まない。 |

例として、招待前に開いた候補の種類数、同じ一体への再訪、呼びかけ後に絵巻で開いたカード、典拠を開いたセッション数を集計できる。割合には対象画面に到達した記録件数を添え、自由記述と対応づける際は、操作から本人の動機や理解を推定したことと、本人が語ったことを区別する。

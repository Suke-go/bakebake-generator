#!/usr/bin/env python3
"""Writes the children's hint and description for every unit (SPEC v3, 5.3).

The hint is made from the summary with the record's names masked (mask_names in
scripts/archive-race/embed_stories.py) and is rejected if a name still shows.
Results are kept in data/hyakki/texts.json by unit key, so a rerun only asks for
units that have none. A unit without an accepted text is not shown by the app.

  python -X utf8 scripts/hyakki/write_texts.py --sample 20   # 20 units now, prints token use and cost
  python -X utf8 scripts/hyakki/write_texts.py               # the rest as one batch (half price), waits for it
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import anthropic
from anthropic.types.message_create_params import MessageCreateParamsNonStreaming
from anthropic.types.messages.batch_create_params import Request

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts" / "archive-race"))
from embed_stories import MASK, mask_names, name_terms  # noqa: E402

OUT = ROOT / "data" / "hyakki"
MODEL = "claude-opus-5-5"
PRICE = (4.0, 20.0)  # $ per million input / output tokens
SYSTEM = """あなたは、日本の妖怪の言い伝えを小学3・4年生が一人で読める文に書き直す編集者です。
元の文は民俗学の記録の要約です。書いてあることだけを使い、新しい出来事や気持ちを足さないでください。

hint: 地図の上で、まだ正体のわからない妖怪についての手がかりとして見せる文です。
- 1文か2文、60字まで。です・ます体。
- 妖怪の名前、呼び名、その一部を絶対に入れない。「なにか」「だれか」「ふしぎなもの」のように言いかえる。
- 話の全部ではなく、何が起きたかの一部だけを書く。

desc: 妖怪に会ったあとに見せる説明です。
- 2文か3文、120字まで。です・ます体。妖怪の名前を使ってよい。
- 元の文にある地名は残す。

どちらも、小学4年生までに習わない漢字はひらがなにし、むずかしい言葉はやさしく言いかえます。言葉のあいだに空白を入れないでください。
suitable: 人が死ぬ、ひどくけがをする、性や差別にかかわるなど、子どもに見せないほうがよい話なら false にします。そのときも hint と desc は空文字で返します。"""
# Second pass for the hint alone: it is the one or two sentences the player decides on (go or not).
HINT_SYSTEM = """あなたは、子ども向けの妖怪あそびの文を書く作家です。
地図の上に、正体のわからない「もや」があります。子どもがそれをおすと、黒いかげの絵といっしょに、あなたの書いた文が出ます。
子どもはその文だけを読んで、「会いにいく」か「やめる」かを決めます。読んだ子が「え、なにそれ。行ってみたい」と思う文を書いてください。

書き方:
- 1文か2文、あわせて60字まで。です・ます体。小学3・4年生が一人で読める言葉。4年生までに習わない漢字はひらがな。空白を入れない。
- 元の文の中で、いちばんふしぎな一しゅん(聞こえた音、見えた光、さわった感じ、起きたへんなこと)から書きはじめる。
- 正体やけつまつは書かない。なぞがのこるところで止める。
- 2文にするときは、2文目を1文目のつづきにする。べつの話にとばない。
- 妖怪の名前、呼び名、その一部を絶対に入れない。動物や人のすがたが正体なら、それも言わない(「なにか」「だれか」「ふしぎなもの」)。
- 元の文にないことを足さない。教訓や感想、「〜でしょうか」のような問いかけで終わらない。
- 場所の名前、人の名前、年は入れない。"""
def text_schema(field: str) -> dict:
    return {"type": "object", "additionalProperties": False, "required": [field], "properties": {field: {"type": "string"}}}


def pass_params(unit: dict, field: str) -> MessageCreateParamsNonStreaming:
    masked, _ = mask_names(unit["sourceSummary"], unit["sourceName"])
    return MessageCreateParamsNonStreaming(
        model=MODEL, max_tokens=4000, system=PASSES[field]["system"],
        output_config={"effort": PASSES[field]["effort"], "format": {"type": "json_schema", "schema": text_schema(field)}},
        messages=[{"role": "user", "content": f"伏せる名前: {unit['name']}\n元の文(名前は「{MASK}」に置きかえてあります): {masked}"}])


def accept_pass(unit: dict, message, field: str) -> str | None:
    if message.stop_reason != "end_turn":
        return None
    hint = json.loads(next(b.text for b in message.content if b.type == "text"))[field].strip().rstrip("。")
    names = set(name_terms(unit["sourceName"])) | set(name_terms(unit["name"])) | {MASK}
    return hint if hint and len(hint) <= PASSES[field]["max"] and not any(n in hint for n in names) else None


# Third text: the few words in the cloud bubble that floats over a mist before any tap.
TEASE_SYSTEM = """あなたは、子ども向けの妖怪あそびの文を書く作家です。
地図の上の「もや」から、雲の形の小さな吹き出しが出ます。そこに入れる、ひとことを書いてください。
読んだ子が「え、なにそれ」と気になって、もやをおしたくなるひとことです。

書き方:
- 14字まで。1つの句。文の終わりの「。」は付けない。空白を入れない。
- その妖怪ならではの、いちばん変わった特徴や、することを言う(例: 「うでをかしてと言う」「夜だけ牛になる」「皿をたたくと来る」「川で名前をよぶ」)。
- どの妖怪にも言える言葉(「ふしぎなもの」「こわいよ」「だれかいる」)にしない。
- 妖怪の名前、呼び名、その一部を絶対に入れない。正体の動物や物の名前も言わない。
- 小学3・4年生が読める言葉。4年生までに習わない漢字はひらがな。
- 元の文にないことを足さない。場所の名前、人の名前、年は入れない。"""
PASSES = {
    "hint": {"system": HINT_SYSTEM, "max": 70, "effort": "medium"},
    "tease": {"system": TEASE_SYSTEM, "max": 16, "effort": "medium"},
}


SCHEMA = {"type": "object", "additionalProperties": False, "required": ["suitable", "hint", "desc"],
          "properties": {"suitable": {"type": "boolean"}, "hint": {"type": "string"}, "desc": {"type": "string"}}}


def params(unit: dict) -> MessageCreateParamsNonStreaming:
    masked, _ = mask_names(unit["sourceSummary"], unit["sourceName"])
    return MessageCreateParamsNonStreaming(
        model=MODEL, max_tokens=4000, system=SYSTEM,
        output_config={"effort": "low", "format": {"type": "json_schema", "schema": SCHEMA}},
        messages=[{"role": "user", "content": f"妖怪の名前: {unit['name']}\n名前を「{MASK}」に置きかえた文(hint はこちらから): {masked}\n元の文(desc はこちらから): {unit['sourceSummary']}"}])


def accept(unit: dict, message) -> dict | None:
    """The parsed text, or None when the model stopped early or the hint names the yokai."""
    if message.stop_reason != "end_turn":
        return None
    data = json.loads(next(b.text for b in message.content if b.type == "text"))
    if not data["suitable"]:
        return {"suitable": False}
    names = set(name_terms(unit["sourceName"])) | set(name_terms(unit["name"])) | {MASK}
    if not data["hint"] or not data["desc"] or any(n in data["hint"] for n in names):
        return None
    return {"suitable": True, "hint": data["hint"], "desc": data["desc"], "record": unit["sourceRecord"]}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--sample", type=int, default=0)
    ap.add_argument("--hints", action="store_true", help="rewrite the hint of every unit that has a text (second pass)")
    ap.add_argument("--teases", action="store_true", help="write the cloud-bubble words of every unit that has a text")
    args = ap.parse_args()
    if args.hints or args.teases:
        return second_pass(args.sample, "hint" if args.hints else "tease")
    units = json.loads((OUT / "units.json").read_text(encoding="utf-8"))
    path = OUT / "texts.json"
    texts = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    # A text written from another record (the unit's stories changed) is asked for again.
    todo = [u for u in units if texts.get(u["key"], {}).get("record", u["sourceRecord"]) != u["sourceRecord"] or u["key"] not in texts]
    by_key = {u["key"]: u for u in todo}
    client = anthropic.Anthropic()
    used = [0, 0]
    rejected = 0

    def keep(key: str, message) -> None:
        nonlocal rejected
        used[0] += message.usage.input_tokens
        used[1] += message.usage.output_tokens
        result = accept(by_key[key], message)
        if result is None:
            rejected += 1
        else:
            texts[key] = result

    if args.sample:
        for u in todo[:: max(1, len(todo) // args.sample)][: args.sample]:
            keep(u["key"], client.messages.create(**params(u)))
    elif todo:
        marker = OUT / "texts-batch.txt"   # lets a rerun pick up a batch that was already sent
        if marker.exists():
            batch_id = marker.read_text().strip()
        else:
            # custom_id allows only [a-zA-Z0-9_-]; unit keys are Japanese, so requests are numbered.
            batch_id = client.messages.batches.create(requests=[Request(custom_id=str(i), params=params(u)) for i, u in enumerate(todo)]).id
            marker.write_text(batch_id)
            (OUT / "texts-batch-keys.json").write_text(json.dumps([u["key"] for u in todo], ensure_ascii=False), encoding="utf-8")
        keys = json.loads((OUT / "texts-batch-keys.json").read_text(encoding="utf-8"))
        while client.messages.batches.retrieve(batch_id).processing_status != "ended":
            print("waiting for batch", batch_id, flush=True)
            time.sleep(60)
        for result in client.messages.batches.results(batch_id):
            key = keys[int(result.custom_id)]
            if result.result.type == "succeeded" and key in by_key:
                keep(key, result.result.message)
            else:
                rejected += 1
        marker.unlink()

    path.write_text(json.dumps(texts, ensure_ascii=False, indent=0), encoding="utf-8")
    cost = (used[0] * PRICE[0] + used[1] * PRICE[1]) / 1e6 * (1 if args.sample else 0.5)
    shown = sum(1 for u in units if texts.get(u["key"], {}).get("suitable"))
    print(json.dumps({"asked": len(todo) if not args.sample else args.sample, "rejectedOrFailed": rejected,
                      "inputTokens": used[0], "outputTokens": used[1], "costUsd": round(cost, 2),
                      "unitsWithText": shown, "unitsMarkedUnsuitable": sum(1 for u in units if texts.get(u["key"], {}).get("suitable") is False),
                      "unitsStillWithout": sum(1 for u in units if u["key"] not in texts)}, ensure_ascii=False))


def second_pass(sample: int, field: str) -> None:
    """Writes texts[key][field] and marks it "<field>Pass": 2; what was there stays when the new text is rejected."""
    done = field + "Pass"
    units = json.loads((OUT / "units.json").read_text(encoding="utf-8"))
    path = OUT / "texts.json"
    texts = json.loads(path.read_text(encoding="utf-8"))
    todo = [u for u in units if texts.get(u["key"], {}).get("suitable") and texts[u["key"]].get(done) != 2]
    client = anthropic.Anthropic()
    used, rejected = [0, 0], 0

    def keep(unit: dict, message) -> None:
        nonlocal rejected
        used[0] += message.usage.input_tokens
        used[1] += message.usage.output_tokens
        hint = accept_pass(unit, message, field)
        if hint is None:
            rejected += 1
        else:
            if sample:
                print("■", unit["sourceSummary"][:70], "\n   前:", texts[unit["key"]].get(field), "\n   後:", hint)
            else:
                texts[unit["key"]].update({field: hint, done: 2})

    if sample:
        for u in todo[:: max(1, len(todo) // sample)][:sample]:
            keep(u, client.messages.create(**pass_params(u, field)))
    elif todo:
        marker = OUT / f"{field}s-batch.txt"
        if not marker.exists():
            marker.write_text(client.messages.batches.create(requests=[Request(custom_id=str(i), params=pass_params(u, field)) for i, u in enumerate(todo)]).id)
            (OUT / f"{field}s-batch-keys.json").write_text(json.dumps([u["key"] for u in todo], ensure_ascii=False), encoding="utf-8")
        batch_id = marker.read_text().strip()
        by_key = {u["key"]: u for u in units}
        keys = json.loads((OUT / f"{field}s-batch-keys.json").read_text(encoding="utf-8"))
        while client.messages.batches.retrieve(batch_id).processing_status != "ended":
            print("waiting for batch", batch_id, flush=True)
            time.sleep(60)
        for result in client.messages.batches.results(batch_id):
            unit = by_key.get(keys[int(result.custom_id)])
            if result.result.type == "succeeded" and unit and unit["key"] in texts:
                keep(unit, result.result.message)
            else:
                rejected += 1
        marker.unlink()
        path.write_text(json.dumps(texts, ensure_ascii=False, indent=0), encoding="utf-8")
    cost = (used[0] * PRICE[0] + used[1] * PRICE[1]) / 1e6 * (1 if sample else 0.5)
    print(json.dumps({"asked": sample or len(todo), "rejectedOrFailed": rejected, "inputTokens": used[0], "outputTokens": used[1], "costUsd": round(cost, 2)}))


if __name__ == "__main__":
    main()

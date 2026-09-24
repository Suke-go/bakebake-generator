'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { DISTURBANCE, HANDLING, POSITION, type CodingAnswer, type CodingItem, type Option } from '@/lib/label-coding';
import styles from './Coding.module.css';

type Loaded = { coder: 'first' | 'second'; items: CodingItem[]; answers: Record<string, CodingAnswer>; completed: boolean };
type Field = 'A1' | 'B' | 'H';
const PAGE = 10;
const EMPTY: CodingAnswer = { A1: null, B: null, H: null, memo: '' };
const filled = (a?: CodingAnswer) => Boolean(a && a.A1 && a.B && a.H);

async function call(body: Record<string, unknown>) {
    const r = await fetch('/api/label-coding', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return r.json();
}

function Guide() {
    return (
        <details className={styles.guide}>
            <summary>手引き（はじめに必ずお読みください。いつでも開けます）</summary>
            <p>記録ごとに、下の三つの欄を、要約の文面だけから選んでください。システムが付けた値は見せていません。要約から決まらないときは、いちばん近いものを選び、メモに一言残してください。選ぶたびに自動で保存されます。途中でやめても、同じリンクから続きができます。</p>
            <p>背景：記録は「何かのせいにした後」の報告です。この欄は、その「前」の状況（誰と誰の間で、何が起きて、どう扱われたか）を読むためのものです。</p>
            <h3>相手：出来事のもう一方の当事者は誰か（何かのせいにする前の姿で）</h3>
            <ol>
                <li>要約の中に、害や変化にかかわる<strong>人間</strong>が書かれていれば、その人の立場で選ぶ（身内／内側の他人／外から来た者／集団）。</li>
                <li>人間が書かれていなければ、自然／本人の行い／正体不明から選ぶ。</li>
            </ol>
            <ul>
                <li>名のある存在（狐、河童、天狗）そのものは値にしない。その裏に書かれている人間・自然を探し、なければ「正体不明」。</li>
                <li>人の姿で現れた存在（娘に化けた狐など）は人間ではない。「正体不明」。人間として扱うのは、要約の中で本当に人間とされている者だけ。</li>
                <li>「本人の行い」は、本人の行い（禁を破る、約束を守らない、殺生する）が出来事のもとだと書かれているときだけ。本人に何かが起きただけなら、相手を探し、なければ「正体不明」。</li>
                <li>動物は、動物としてふるまう（馬が暴れる、猪が荒らす）ときだけ「自然」。化かす・憑く・祟るなど、何かのせいにされているときは「正体不明」。</li>
                <li>「集団」は、特定の人や家を指さないときだけ。特定の家や人が書かれていれば「内側の他人」。</li>
            </ul>
            <h3>働き：何が起きたか</h3>
            <p>1 から順に確かめ、最初に当てはまるものを一つ選ぶ。</p>
            <h3>処理：その出来事に対して、何をしたか</h3>
            <p>記録に書かれていることだけで選ぶ。書かれていなければ「なし」。</p>
        </details>
    );
}

function Choices({ legend, name, options, value, onPick }: { legend: string; name: string; options: Option[]; value: string | null; onPick: (v: string) => void }) {
    return (
        <fieldset className={styles.fieldset}>
            <legend className={styles.legend}>{legend}</legend>
            {options.map((o) => (
                <label key={o.v} className={styles.opt}>
                    <input type="radio" name={name} checked={value === o.v} onChange={() => onPick(o.v)} />
                    <span className={styles.optLabel}>{o.label}</span>
                    <span className={styles.hint}>{o.hint}</span>
                </label>
            ))}
        </fieldset>
    );
}

export default function CodingClient() {
    const token = useSearchParams().get('t');
    const [data, setData] = useState<Loaded | null>(null);
    const [failed, setFailed] = useState(false);
    const [answers, setAnswers] = useState<Record<string, CodingAnswer>>({});
    const [page, setPage] = useState(0);
    const [onlyMissing, setOnlyMissing] = useState<string[] | null>(null);
    const [saveState, setSaveState] = useState('');
    const [msg, setMsg] = useState('');
    const [completed, setCompleted] = useState(false);
    const queue = useRef<Promise<unknown>>(Promise.resolve());

    useEffect(() => {
        if (!token) return;
        let alive = true;
        call({ type: 'load', token }).then((v) => {
            if (!alive) return;
            if (v.error) { setFailed(true); return; }
            setData(v); setAnswers(v.answers ?? {}); setCompleted(Boolean(v.completed));
        }).catch(() => { if (alive) setFailed(true); });
        return () => { alive = false; };
    }, [token]);

    function save(id: string, answer: CodingAnswer) {
        setSaveState('保存中…');
        queue.current = queue.current.then(async () => {
            try {
                const v = await call({ type: 'save', token, id, answer });
                setSaveState(v.ok ? '保存しました' : '保存できませんでした');
            } catch { setSaveState('保存できませんでした（通信）'); }
        });
    }

    function update(id: string, patch: Partial<CodingAnswer>, persist = true) {
        const next = { ...EMPTY, ...answers[id], ...patch };
        setAnswers((s) => ({ ...s, [id]: next }));
        if (persist) save(id, next);
    }

    async function complete() {
        setMsg('');
        await queue.current;
        const v = await call({ type: 'complete', token });
        if (v.ok) { setCompleted(true); window.scrollTo(0, 0); }
        else if (v.error === 'incomplete') setMsg(`未入力の記録が ${v.missing} 件あります。`);
        else setMsg('送れませんでした。時間をおいてもう一度お試しください。');
    }

    if (!token || failed) return <main className={styles.page}><div className={styles.shell}><p>このリンクは使えません。リンクをもう一度確かめてください。</p></div></main>;
    if (!data) return <main className={styles.page}><div className={styles.shell}><p>読み込み中…</p></div></main>;

    const items = data.items;
    const done = items.filter((it) => filled(answers[it.id])).length;
    const list = onlyMissing ? items.filter((it) => onlyMissing.includes(it.id)) : items;
    const pages = Math.max(1, Math.ceil(list.length / PAGE));
    const p = Math.min(page, pages - 1);
    const shown = list.slice(p * PAGE, p * PAGE + PAGE);
    const go = (n: number) => { setPage(n); window.scrollTo(0, 0); };
    const toggleMissing = (on: boolean) => { setOnlyMissing(on ? items.filter((it) => !filled(answers[it.id])).map((it) => it.id) : null); setPage(0); };

    const pager = (
        <div className={styles.pager}>
            <button className={styles.ghost} disabled={p === 0} onClick={() => go(p - 1)}>前の{PAGE}件</button>
            <span>{p + 1} / {pages} ページ</span>
            <button className={styles.ghost} disabled={p >= pages - 1} onClick={() => go(p + 1)}>次の{PAGE}件</button>
        </div>
    );

    return (
        <main className={styles.page}>
            <div className={styles.shell}>
                <h1 className={styles.title}>記録のコーディング（{items.length}件）</h1>
                {completed && <p>送信を受け取りました。ありがとうございました。このあとも、同じリンクから修正できます（修正も自動で保存されます）。</p>}
                <Guide />

                <div className={styles.bar}>
                    <span>{done} / {items.length} 件 入力済み</span>
                    <div className={styles.progress}><div className={styles.progressFill} style={{ width: `${(100 * done) / items.length}%` }} /></div>
                    <label className={styles.check}><input type="checkbox" checked={onlyMissing !== null} onChange={(e) => toggleMissing(e.target.checked)} /> 未入力のみ</label>
                    <span className={styles.saveState}>{saveState}</span>
                </div>

                <section className={styles.section}>
                    {pager}
                    {shown.length === 0 && <p>未入力の記録はありません。</p>}
                    {shown.map((it) => {
                        const a = answers[it.id] ?? EMPTY;
                        const pick = (f: Field) => (v: string) => update(it.id, { [f]: v } as Partial<CodingAnswer>);
                        return (
                            <article key={it.id} className={`${styles.card} ${filled(a) ? styles.cardDone : ''}`}>
                                <p className={styles.meta}>No. {it.no}　{it.name}{it.pref ? `（${it.pref}）` : ''}{filled(a) ? '　✓ 入力済み' : ''}</p>
                                <p className={styles.summary}>{it.summary}</p>
                                <div className={styles.cols}>
                                    <Choices legend="相手" name={`A1-${it.id}`} options={POSITION} value={a.A1} onPick={pick('A1')} />
                                    <Choices legend="処理" name={`H-${it.id}`} options={HANDLING} value={a.H} onPick={pick('H')} />
                                    <div className={styles.wide}>
                                        <Choices legend="働き（1 から順に確かめ、最初に当てはまるもの）" name={`B-${it.id}`} options={DISTURBANCE} value={a.B} onPick={pick('B')} />
                                    </div>
                                    <label className={`${styles.fieldset} ${styles.wide}`}>
                                        <span className={styles.legend}>メモ（迷ったとき、要約から決まらないときに一言）</span>
                                        <input className={styles.memo} maxLength={500} value={a.memo}
                                            onChange={(e) => update(it.id, { memo: e.target.value }, false)}
                                            onBlur={() => save(it.id, { ...EMPTY, ...answers[it.id] })} />
                                    </label>
                                </div>
                            </article>
                        );
                    })}
                    {pager}
                    <div className={styles.section}>
                        <p>{done === items.length ? 'すべて入力されました。最後に送信してください。' : `残り ${items.length - done} 件です。すべて入力すると送信できます。`}</p>
                        <button className={styles.button} disabled={done < items.length} onClick={complete}>{completed ? 'もう一度送信する' : '送信する（完了）'}</button>
                        {msg && <p className={styles.error}>{msg}</p>}
                    </div>
                </section>
            </div>
        </main>
    );
}

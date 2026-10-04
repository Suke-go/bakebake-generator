'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import styles from './ContactStudy.module.css';

type Rec = { id: string; name: string; region: string; summary: string; statement?: string };
type Acc = { index: 0 | 1; text: string; withStatements: boolean; done: boolean; records: Rec[] };
type View = { phase: string; accounts?: Acc[]; error?: string };
type Level = 0 | 1 | 2 | 3 | 'na';
type Answer = { match?: Level; useful?: Level; where?: string; attribution?: 'yes' | 'no'; statementValid?: 'valid' | 'partial' | 'invalid' };

async function call(body: Record<string, unknown>): Promise<View & { token?: string }> {
    const r = await fetch('/api/contact-study', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return r.json();
}

const MATCH: { v: Level; label: string }[] = [
    { v: 0, label: '0 対応していない' },
    { v: 1, label: '1 少し対応している' },
    { v: 2, label: '2 はっきり対応している' },
    { v: 3, label: '3 ほとんど同じ状況だ' },
    { v: 'na', label: '判断できない' },
];
const USEFUL: { v: Level; label: string }[] = [
    { v: 0, label: '0 役に立たない' },
    { v: 1, label: '1 少し役に立つ' },
    { v: 2, label: '2 役に立つ' },
    { v: 3, label: '3 とても役に立つ' },
    { v: 'na', label: '判断できない' },
];

const STORE_KEY = 'contact-study-token';

export default function ContactStudyClient() {
    const router = useRouter();
    const params = useSearchParams();
    const token = params.get('t');
    const [loaded, setView] = useState<View | null>(null);
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState('');
    const [consent, setConsent] = useState(false);
    const [texts, setTexts] = useState(['', '']);
    const [profile, setProfile] = useState<{ age: string; gender: string; familiarity: number | null; folkloreTraining: string }>({ age: '', gender: '', familiarity: null, folkloreTraining: '' });
    const [answers, setAnswers] = useState<Record<string, Answer>>({});
    const [email, setEmail] = useState('');
    const fresh = params.get('new') === '1';
    const view: View | null = token ? loaded : { phase: 'consent' };

    useEffect(() => {
        if (!token) return;
        let alive = true;
        call({ type: 'load', token }).then((v) => {
            if (!alive) return;
            setView(v.error ? { phase: 'error', error: v.error } : v);
            if (!v.error) { try { localStorage.setItem(STORE_KEY, token); } catch { /* storage unavailable */ } }
        });
        return () => { alive = false; };
    }, [token]);

    // Same browser: reopening /study/contact returns to the participant's own page (no need to keep the link).
    useEffect(() => {
        if (token || fresh) return;
        try {
            const saved = localStorage.getItem(STORE_KEY);
            if (saved && /^[0-9a-f]{48}$/.test(saved)) router.replace(`/study/contact?t=${saved}`);
        } catch { /* storage unavailable */ }
    }, [token, fresh, router]);

    const link = typeof window !== 'undefined' && token ? `${window.location.origin}/study/contact?t=${token}` : '';

    async function start() {
        setBusy(true);
        const v = await call({ type: 'start', consent: true });
        setBusy(false);
        if (v.token) {
            try { localStorage.setItem(STORE_KEY, v.token); } catch { /* storage unavailable */ }
            router.replace(`/study/contact?t=${v.token}`);
        }
        else setMsg('開始できませんでした。時間をおいてもう一度お試しください。');
    }

    async function submitAccounts() {
        if (!profile.age || !profile.gender || profile.familiarity === null || !profile.folkloreTraining) { setMsg('あなたについての質問に、すべて答えてください。'); return; }
        if (!email.trim()) { setMsg('2回目のご案内を送るメールアドレスを入力してください。'); return; }
        setBusy(true); setMsg('');
        const v = await call({ type: 'accounts', token, accounts: texts, profile, email });
        setBusy(false);
        if (v.error === 'invalid_profile') setMsg('あなたについての質問に、すべて答えてください。');
        else if (v.error === 'invalid_email') setMsg('メールアドレスを確かめてください。');
        else if (v.error) setMsg('それぞれ60字以上600字以内で書いてください。'); else setView(v);
    }

    async function submitRatings(acc: Acc) {
        const ratings: Record<string, Answer> = {};
        for (const r of acc.records) {
            const a = answers[`${acc.index}:${r.id}`] ?? {};
            if (a.match === undefined || a.useful === undefined) { setMsg('すべての記録に、対応の程度と役に立つ程度を選んでください。'); return; }
            if ((a.match === 2 || a.match === 3) && !a.where?.trim()) { setMsg('対応で 2 か 3 を選んだ記録には、どこが対応しているかを書いてください。'); return; }
            if (!a.attribution) { setMsg('記録の説明を自分の体験の原因だと思うかにも答えてください。'); return; }
            if (acc.withStatements && !a.statementValid) { setMsg('説明文が妥当かどうかも選んでください。'); return; }
            ratings[r.id] = a;
        }
        setBusy(true); setMsg('');
        const v = await call({ type: 'ratings', token, accountIndex: acc.index, ratings });
        setBusy(false);
        if (v.error) setMsg('保存できませんでした。入力を確かめてください。'); else { setView(v); window.scrollTo(0, 0); }
    }

    const set = (key: string, patch: Answer) => setAnswers((s) => ({ ...s, [key]: { ...s[key], ...patch } }));

    if (!view) return <main className={styles.page}><div className={styles.shell}><p>読み込み中…</p></div></main>;

    return (
        <main className={styles.page}>
            <div className={styles.shell}>
                <h1 className={styles.title}>昔の話と、今の体験</h1>

                {view.phase === 'consent' && (
                    <section className={styles.section}>
                        <p>この研究では、あなたの最近の体験と、日本各地に伝わる怪異・妖怪の記録（国際日本文化研究センターのデータベース）とのつながりを確かめます。</p>
                        <p>1回目に、最近の体験を2つ書いていただきます（10分ほど）。10月5日の夕方以降に、メールでお送りするリンクから、体験ごとに7件ほどの記録を読んで評価していただきます（20分ほど）。2回目の締切は10月6日の午前11時です。</p>
                        <p>書いた体験は、研究のために言語モデルで処理します。実名、地名、勤め先など、あなたや他の人が特定される情報は書かないでください。回答はいつでもやめられます。やめた場合、それまでの回答は使いません。</p>
                        <p>謝礼はありません。書いた体験の文章そのものは公開しません。評価の結果は、個人が分からない形で研究論文にまとめます。</p>
                        <p>2回目の準備ができたら、ご案内をメールでお送りします。メールアドレスはそのためだけに使い、体験や回答とは別に保管し、研究が終わったら消去します。</p>
                        <label className={styles.check}><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} /> 18歳以上で、上の内容を理解し、協力に同意します</label>
                        <button className={styles.button} disabled={!consent || busy} onClick={start}>はじめる</button>
                        {msg && <p className={styles.error}>{msg}</p>}
                    </section>
                )}

                {token && view.phase !== 'consent' && view.phase !== 'error' && view.phase !== 'complete' && (
                    <p className={styles.note}>2回目の準備ができたら、登録したメールアドレスにリンクをお送りします。同じブラウザなら、このページ（bakemon.net/study/contact）を開くだけでも続きに戻れます。念のため、このリンクも保存しておいてください：<br /><span className={styles.link}>{link}</span><br />この端末で別の方が新しく始めるときは <a className={styles.link} href="/study/contact?new=1">こちら</a>。</p>
                )}

                {view.phase === 'accounts' && (
                    <section className={styles.section}>
                        <p className={styles.label}>はじめに、あなたについて教えてください</p>
                        <div className={styles.field}>
                            <p className={styles.q}>年代</p>
                            <div className={styles.options}>{([['18-19', '18〜19歳'], ['20s', '20代'], ['30s', '30代'], ['40s', '40代'], ['50s', '50代'], ['60s', '60代'], ['70+', '70代以上'], ['no_answer', '答えない']] as const).map(([v, l]) => (
                                <label key={v}><input type="radio" name="p-age" checked={profile.age === v} onChange={() => setProfile((p) => ({ ...p, age: v }))} /> {l}</label>
                            ))}</div>
                            <p className={styles.q}>性別</p>
                            <div className={styles.options}>{([['woman', '女性'], ['man', '男性'], ['other', 'その他'], ['no_answer', '答えない']] as const).map(([v, l]) => (
                                <label key={v}><input type="radio" name="p-gender" checked={profile.gender === v} onChange={() => setProfile((p) => ({ ...p, gender: v }))} /> {l}</label>
                            ))}</div>
                            <p className={styles.q}>怪異・妖怪の話（昔話、伝説、言い伝えなど）に、どのくらい親しんでいますか。</p>
                            <div className={styles.options}>{([[0, 'ほとんど知らない'], [1, '少し知っている'], [2, 'よく読む・聞く'], [3, 'とても詳しい']] as const).map(([v, l]) => (
                                <label key={v}><input type="radio" name="p-fam" checked={profile.familiarity === v} onChange={() => setProfile((p) => ({ ...p, familiarity: v }))} /> {l}</label>
                            ))}</div>
                            <p className={styles.q}>大学などで、民俗学を専門に学んだことがありますか。</p>
                            <div className={styles.options}>{([['no', 'いいえ'], ['yes', 'はい']] as const).map(([v, l]) => (
                                <label key={v}><input type="radio" name="p-folk" checked={profile.folkloreTraining === v} onChange={() => setProfile((p) => ({ ...p, folkloreTraining: v }))} /> {l}</label>
                            ))}</div>
                        </div>
                        <div className={styles.field}>
                            <p className={styles.q}>メールアドレス（2回目のご案内を送るためだけに使います）</p>
                            <input className={styles.input} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                        </div>
                        <p>最近あった出来事で、気になっていること、困っていること、うまく説明できないことを書いてください。何があったか、どう感じたか、今どうなっているかを、それぞれ100〜400字ほどで。</p>
                        {[0, 1].map((i) => (
                            <div key={i} className={styles.field}>
                                <p className={styles.label}>{i === 0 ? '1つめ：人が相手の出来事（家族・職場・友人・近所・SNS など）' : '2つめ：人が相手ではない出来事（体や気持ちの変化、やめられないこと、場所や自然、物、失ったもの、説明のつかない出来事など）'}</p>
                                <textarea className={styles.textarea} rows={7} value={texts[i]} onChange={(e) => setTexts((t) => t.map((x, j) => (j === i ? e.target.value : x)))} />
                                <p className={styles.count}>{texts[i].trim().length} 字</p>
                            </div>
                        ))}
                        <button className={styles.button} disabled={busy} onClick={submitAccounts}>送る</button>
                        {msg && <p className={styles.error}>{msg}</p>}
                    </section>
                )}

                {view.phase === 'waiting' && (
                    <section className={styles.section}><p>ありがとうございました。10月5日の夕方以降に、2回目のご案内をメールでお送りします。記録の準備ができる前にこのページを開いた場合は、この画面が表示されます。</p></section>
                )}

                {view.phase === 'review' && view.accounts && (() => {
                    const acc = view.accounts.find((a) => !a.done);
                    if (!acc) return null;
                    return (
                        <section className={styles.section}>
                            <p className={styles.label}>あなたが書いた体験</p>
                            <blockquote className={styles.quote}>{acc.text}</blockquote>
                            <p>この体験について、昔の記録を{acc.records.length}件お見せします。1件ずつ読んで答えてください。記録にある「狐のせい」「祟り」などの説明は、その土地で昔そう語られたものです。</p>
                            {acc.records.map((r, n) => {
                                const key = `${acc.index}:${r.id}`; const a = answers[key] ?? {};
                                return (
                                    <article key={r.id} className={styles.card}>
                                        <p className={styles.meta}>{n + 1}／{acc.records.length}　{r.name}{r.region ? `（${r.region}）` : ''}</p>
                                        <p className={styles.summary}>{r.summary}</p>
                                        {acc.withStatements && <p className={styles.statement}><span className={styles.statementLabel}>どこが対応しているか：</span>{r.statement}</p>}
                                        <p className={styles.q}>記録の中の状況は、あなたの体験の状況と対応していますか。</p>
                                        <div className={styles.options}>{MATCH.map((g) => (
                                            <label key={String(g.v)}><input type="radio" name={`m-${key}`} checked={a.match === g.v} onChange={() => set(key, { match: g.v })} /> {g.label}</label>
                                        ))}</div>
                                        {(a.match === 2 || a.match === 3) && (
                                            <><p className={styles.q}>どこが対応していますか（一文で）。</p>
                                                <input className={styles.input} value={a.where ?? ''} onChange={(e) => set(key, { where: e.target.value })} /></>
                                        )}
                                        <p className={styles.q}>この記録は、あなたが自分の体験について考える役に立ちますか。</p>
                                        <div className={styles.options}>{USEFUL.map((g) => (
                                            <label key={String(g.v)}><input type="radio" name={`u-${key}`} checked={a.useful === g.v} onChange={() => set(key, { useful: g.v })} /> {g.label}</label>
                                        ))}</div>
                                        <p className={styles.q}>この記録を読んで、あなたの体験の原因も、記録にある説明（狐・霊・祟りなど）だと思いますか。</p>
                                        <div className={styles.options}>
                                            <label><input type="radio" name={`a-${key}`} checked={a.attribution === 'yes'} onChange={() => set(key, { attribution: 'yes' })} /> はい</label>
                                            <label><input type="radio" name={`a-${key}`} checked={a.attribution === 'no'} onChange={() => set(key, { attribution: 'no' })} /> いいえ</label>
                                        </div>
                                        {acc.withStatements && (<>
                                            <p className={styles.q}>「どこが対応しているか」の説明は、記録の内容に照らして妥当ですか。</p>
                                            <div className={styles.options}>
                                                {([['valid', '妥当'], ['partial', '一部妥当'], ['invalid', '妥当でない']] as const).map(([v, l]) => (
                                                    <label key={v}><input type="radio" name={`s-${key}`} checked={a.statementValid === v} onChange={() => set(key, { statementValid: v })} /> {l}</label>
                                                ))}
                                            </div></>)}
                                    </article>
                                );
                            })}
                            <button className={styles.button} disabled={busy} onClick={() => submitRatings(acc)}>この体験の回答を送る</button>
                            {msg && <p className={styles.error}>{msg}</p>}
                        </section>
                    );
                })()}

                {view.phase === 'complete' && <section className={styles.section}><p>すべての回答を受け取りました。ご協力ありがとうございました。</p></section>}
                {view.phase === 'error' && <section className={styles.section}><p>このリンクは使えません。リンクをもう一度確かめてください。</p></section>}
            </div>
        </main>
    );
}

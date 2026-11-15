'use client';

// /hyakki/exp: the same game with a short consent, two questions before, and a short questionnaire after.
// One anonymous record per play is sent at the end; nothing is sent if the player leaves earlier.
import Link from 'next/link';
import { useEffect, useState } from 'react';
import Hyakki, { type PlayLog } from './Hyakki';
import styles from './HyakkiExp.module.css';

export const EXP_VERSION = 'hyakki-exp-v1';
const AGES = ['10代', '20代', '30代', '40代', '50代', '60代', '70代以上', '答えない'];
const GENDERS = ['女性', '男性', 'その他', '答えない'];

// One statement per element of the design (foothold, trace, collection, world x2), then the overall ones.
const SCALES: { key: string; text: string }[] = [
    { key: 'foothold', text: '自分の町の近くの妖怪だと思うと、興味がわいた' },
    { key: 'trace', text: '雲の一言を見て、続きが知りたくなった' },
    { key: 'collection', text: '選んだ5体は、自分で集めたものだと感じた' },
    { key: 'worldLink', text: '集まってきた妖怪と、自分が選んだ妖怪のつながりが分かった' },
    { key: 'worldSpread', text: '日本のあちこちに、似た話があると感じた' },
    { key: 'enjoy', text: '楽しかった' },
    { key: 'again', text: 'もう一度やってみたい' },
];
const INTEREST = '妖怪や昔の言い伝えに興味がある';

function Scale({ value, onChange, label }: { value: number | null; onChange: (v: number) => void; label: string }) {
    return (
        <fieldset className={styles.scale}>
            <legend>{label}</legend>
            <div className={styles.points}>
                <span>そう思わない</span>
                {[1, 2, 3, 4, 5].map(n => (
                    <button key={n} type="button" aria-pressed={value === n} aria-label={`${n}`} onClick={() => onChange(n)}>{n}</button>
                ))}
                <span>そう思う</span>
            </div>
        </fieldset>
    );
}

export default function HyakkiExp() {
    const [step, setStep] = useState<'consent' | 'before' | 'play' | 'after' | 'done'>('consent');
    const [age, setAge] = useState('');
    const [gender, setGender] = useState('');
    const [interestBefore, setInterestBefore] = useState<number | null>(null);
    const [log, setLog] = useState<PlayLog | null>(null);
    // Half the players are asked to start from a town they know, half from one they do not: the only way to tell
    // what the familiar starting point adds. Drawn after mounting, so that server and browser render the same page.
    const [town, setTown] = useState<'own' | 'unknown' | null>(null);
    useEffect(() => { setTown(Math.random() < 0.5 ? 'own' : 'unknown'); }, []);
    const [knownTown, setKnownTown] = useState('');
    const [scales, setScales] = useState<Record<string, number>>({});
    const [interestAfter, setInterestAfter] = useState<number | null>(null);
    const [why, setWhy] = useState('');
    const [remember, setRemember] = useState('');
    const [sending, setSending] = useState(false);
    const [failed, setFailed] = useState(false);

    if (step === 'play') return <Hyakki onFinish={done => { setLog(done); setStep('after'); }} />;

    const complete = knownTown !== '' && interestAfter !== null && SCALES.every(q => scales[q.key]);
    const send = async () => {
        setSending(true); setFailed(false);
        try {
            const res = await fetch('/api/hyakki-exp', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ version: EXP_VERSION, consent: true, age, gender, interestBefore, town, knownTown, scales, interestAfter, why, remember, log }),
            });
            if (!res.ok) throw new Error(String(res.status));
            setStep('done');
        } catch { setFailed(true); } finally { setSending(false); }
    };

    return (
        <main className={styles.page}>
            <div className={styles.sheet}>
                {step === 'consent' && (
                    <>
                        <h1>百鬼夜行 ためし遊び</h1>
                        <p>妖怪の言い伝えを集める遊びを、研究のために試してもらっています。5分ほど遊んで、最後に短いアンケートに答えてください。</p>
                        <ul>
                            <li>記録するのは、年代と性別、遊びの中での選び方、アンケートの答えです。</li>
                            <li>名前や連絡先、地図で選んだ町の場所は記録しません。</li>
                            <li>記録は、論文や学会での発表に使います。</li>
                            <li>途中でやめても、何も記録されません。</li>
                        </ul>
                        <div className={styles.actions}>
                            <Link href="/hyakki" className={styles.ghost}>記録なしで遊ぶ</Link>
                            <button type="button" className={styles.primary} onClick={() => setStep('before')}>同意して始める</button>
                        </div>
                    </>
                )}

                {step === 'before' && (
                    <>
                        <h1>はじめに</h1>
                        <label className={styles.field}>年代
                            <select value={age} onChange={e => setAge(e.target.value)}>
                                <option value="">えらぶ</option>
                                {AGES.map(a => <option key={a}>{a}</option>)}
                            </select>
                        </label>
                        <label className={styles.field}>性別
                            <select value={gender} onChange={e => setGender(e.target.value)}>
                                <option value="">えらぶ</option>
                                {GENDERS.map(g => <option key={g}>{g}</option>)}
                            </select>
                        </label>
                        <Scale label={INTEREST} value={interestBefore} onChange={setInterestBefore} />
                        <p className={styles.ask}>
                            {town === 'unknown'
                                ? 'このあと地図で町をえらびます。行ったことのない、知らない町をえらんでください。'
                                : 'このあと地図で町をえらびます。あなたが住んでいる町か、よく知っている町をえらんでください。'}
                        </p>
                        <div className={styles.actions}>
                            <button type="button" className={styles.primary} disabled={!age || !gender || interestBefore === null || !town} onClick={() => setStep('play')}>遊ぶ</button>
                        </div>
                    </>
                )}

                {step === 'after' && (
                    <>
                        <h1>アンケート</h1>
                        <fieldset className={styles.scale}>
                            <legend>最初にえらんだ町は、よく知っている町ですか</legend>
                            <div className={styles.points}>
                                {['はい', 'いいえ'].map(v => <button key={v} type="button" className={styles.wide} aria-pressed={knownTown === v} onClick={() => setKnownTown(v)}>{v}</button>)}
                            </div>
                        </fieldset>
                        {SCALES.map(q => <Scale key={q.key} label={q.text} value={scales[q.key] ?? null} onChange={v => setScales(old => ({ ...old, [q.key]: v }))} />)}
                        <Scale label={INTEREST} value={interestAfter} onChange={setInterestAfter} />
                        <label className={styles.field}>集まってきた妖怪は、なぜ集まったのだと思いますか
                            <textarea value={why} maxLength={500} rows={2} onChange={e => setWhy(e.target.value)} />
                        </label>
                        <label className={styles.field}>いちばん覚えている妖怪や話があれば、教えてください
                            <textarea value={remember} maxLength={500} rows={2} onChange={e => setRemember(e.target.value)} />
                        </label>
                        {failed && <p className={styles.failed} role="alert">送れませんでした。通信をたしかめて、もう一度おしてください。</p>}
                        <div className={styles.actions}>
                            <button type="button" className={styles.primary} disabled={!complete || sending} onClick={() => { void send(); }}>{sending ? '送っています…' : '送る'}</button>
                        </div>
                    </>
                )}

                {step === 'done' && (
                    <>
                        <h1>ありがとうございました</h1>
                        <p>答えを受けとりました。</p>
                        <div className={styles.actions}>
                            <Link href="/hyakki" className={styles.primary}>もう一度遊ぶ</Link>
                        </div>
                    </>
                )}
            </div>
        </main>
    );
}

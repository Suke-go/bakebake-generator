'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ANCHORS, EXHIBIT_VERSION, LORE_INTEREST, PX_ITEMS } from '@/lib/hyakki-exhibit';
import Hyakki, { type PlayLog } from './Hyakki';
import styles from './HyakkiExp.module.css';

type Step = 'consent' | 'play' | 'story' | 'ratings' | 'done';
type ExhibitLog = Pick<PlayLog, 'chosen' | 'openedIds' | 'offeredEchoIds' | 'skippedCall' | 'skippedParade'>;

function Rating({ label, value, change }: { label: string; value?: number; change: (value?: number) => void }) {
    return <label className={styles.field}>{label}
        <select value={value ?? ''} onChange={e => change(e.target.value === '' ? undefined : Number(e.target.value))}>
            <option value="">回答しない</option>
            {ANCHORS.map((anchor, i) => <option value={i - 3} key={anchor}>{anchor}</option>)}
        </select>
    </label>;
}

export default function HyakkiExp() {
    const [step, setStep] = useState<Step>('consent');
    const [id, setId] = useState('');
    const [log, setLog] = useState<ExhibitLog | null>(null);
    const [retelling, setRetelling] = useState('');
    const [imagination, setImagination] = useState('');
    const [ratings, setRatings] = useState<Record<string, number | undefined>>({});
    const [order, setOrder] = useState([...PX_ITEMS]);
    const [interest, setInterest] = useState<number>();
    const [sending, setSending] = useState(false);
    const [failed, setFailed] = useState(false);

    function start() {
        setId(crypto.randomUUID());
        const items = [...PX_ITEMS];
        for (let i = items.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [items[i], items[j]] = [items[j], items[i]];
        }
        setOrder(items);
        setStep('play');
    }
    async function send() {
        if (sending) return;
        setSending(true);
        setFailed(false);
        try {
            const response = await fetch('/api/hyakki-exp', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, version: EXHIBIT_VERSION, consent: true, retelling, imagination, ratings, loreInterest: interest ?? null, log }),
            });
            if (!response.ok) throw new Error('save');
            setStep('done');
        } catch { setFailed(true); } finally { setSending(false); }
    }

    if (step === 'play') return <Hyakki onFinish={({ chosen, openedIds, offeredEchoIds, skippedCall, skippedParade }) => {
        setLog({ chosen, openedIds, offeredEchoIds, skippedCall, skippedParade });
        setStep('story');
    }} />;

    return <main className={styles.page}><section className={styles.sheet} key={step}>
        {step === 'consent' && <>
            <h1>百鬼夜行を呼ぶ</h1>
            <p>地図で好きな町を選び、気になる妖怪を五体誘ってください。五体がどんな仲間を呼ぶか、絵巻で見届けられます。</p>
            <h2>展示研究へのご協力</h2>
            <p>遊び終えたら、覚えている場面をあなたの言葉でお聞かせください。回答は、伝承から妖怪の名前や姿、物語をつくる「妖怪生成装置」の設計と研究発表に使います。</p>
            <p>送信時に、回答と、選んだ妖怪・応答の候補・絵巻で開いた妖怪・演出を飛ばしたかを記録します。氏名や地図のピン位置は回答に保存しません。質問はどれも任意です。</p>
            <div className={styles.actions}><Link className={styles.ghost} href="/hyakki">研究に参加せず遊ぶ</Link>
                <button className={styles.primary} onClick={start}>同意して遊ぶ</button></div>
        </>}
        {step === 'story' && <>
            <h1>あなたの百鬼夜行</h1>
            <label className={styles.field}>今日の百鬼夜行を、ここにいなかった人に一つだけ話すとしたら、どんな話をしますか？
                <textarea rows={3} maxLength={800} value={retelling} onChange={e => setRetelling(e.target.value)} /></label>
            <label className={styles.field}>誘った一体を思い出してください。出会う前にどんな妖怪を想像しましたか？　そう思ったきっかけや、出会って印象が変わったところがあれば教えてください。
                <textarea rows={3} maxLength={800} value={imagination} onChange={e => setImagination(e.target.value)} /></label>
            <p>ひとことでも、空欄でも進めます。個人が分かる名前や連絡先は書かずにお答えください。</p>
            <div className={styles.actions}><a className={styles.ghost} href="/hyakki/exp">送らずに終了</a>
                <button className={styles.primary} onClick={() => setStep('ratings')}>次へ</button></div>
        </>}
        {step === 'ratings' && <>
            <h1>遊んでみてどうでしたか</h1>
            <p>いま遊んだゲームについて、気持ちに近い答えを選んでください。答えたい項目だけで送れます。</p>
            <fieldset className={styles.questions} disabled={sending}>
                <legend className={styles.groupTitle}>ゲームの体験</legend>
                {order.map(([key, label]) => <Rating key={key} label={label} value={ratings[key]} change={value => setRatings(old => ({ ...old, [key]: value }))} />)}
            </fieldset>
            <fieldset className={styles.questions} disabled={sending}><legend className={styles.groupTitle}>伝承への関心</legend>
                <Rating label={LORE_INTEREST} value={interest} change={setInterest} /></fieldset>
            {failed && <p role="alert" className={styles.failed}>送信できませんでした。回答はこの画面に残っています。通信を確認して、もう一度お試しください。</p>}
            <div className={styles.actions}><button className={styles.ghost} disabled={sending} onClick={() => setStep('story')}>戻る</button>
                <button className={styles.primary} disabled={sending} onClick={send}>{sending ? '送信中…' : '回答を送る'}</button></div>
        </>}
        {step === 'done' && <><h1>ありがとうございました</h1><p>回答を受け取りました。</p>
            <div className={styles.actions}><a className={styles.primary} href="/hyakki/exp">展示の最初に戻る</a></div></>}
    </section></main>;
}

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ANCHORS, EXHIBIT_VERSION, LORE_INTEREST, PROGRESS_VERSION, PX_ITEMS, type Reached } from '@/lib/hyakki-exhibit';
import Hyakki, { type HyakkiExhibit, type PlayLog } from './Hyakki';
import styles from './HyakkiExp.module.css';

type Step = 'consent' | 'play' | 'story' | 'ratings' | 'done';
type ExhibitLog = Pick<PlayLog, 'trace' | 'chosen' | 'openedIds' | 'offeredEchoIds' | 'skippedCall' | 'skippedParade'>;
type LogSoFar = Pick<ExhibitLog, 'trace' | 'chosen'> & Partial<ExhibitLog>;

// The exhibit's start, and how the play itself looks and reads inside the exhibit. Every way out of the exhibit
// comes back to HOME, never to /map or the plain /hyakki.
const HOME = '/hyakki/exp';
const PLAY: Omit<HyakkiExhibit, 'onFinish'> = {
    back: { href: HOME, label: '← 最初にもどる' },
    finishLabel: 'アンケートへ進む',
    mapGuide: true,
};

// One tap answers an item; tapping the chosen point again takes the answer back, so every item stays optional.
function Rating({ label, value, change }: { label: string; value?: number; change: (value?: number) => void }) {
    return <fieldset className={styles.scale}>
        <legend>{label}</legend>
        <div className={styles.points}>
            {ANCHORS.map((anchor, i) => <button type="button" key={anchor} aria-label={anchor} title={anchor} aria-pressed={value === i - 3}
                onClick={() => change(value === i - 3 ? undefined : i - 3)}>{i + 1}</button>)}
        </div>
        <div className={styles.ends}><span>{ANCHORS[0]}</span><span>{ANCHORS[ANCHORS.length - 1]}</span></div>
        <p className={styles.picked} aria-live="polite">{value === undefined ? '未回答' : `${value + 4}：${ANCHORS[value + 3]}`}</p>
    </fieldset>;
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
    const [askedEmpty, setAskedEmpty] = useState(false);
    const answered = Object.values(ratings).filter(v => v !== undefined).length + (interest === undefined ? 0 : 1);
    const empty = answered === 0 && !retelling.trim() && !imagination.trim();

    // The operation log is saved as the play goes, apart from the answers, so a visit that ends before the survey
    // still leaves how it went. `last` holds the newest state; leaving the page sends it once more.
    const last = useRef<{ reached: Reached; log: LogSoFar } | null>(null);
    const seq = useRef(0);
    const save = useCallback((reached: Reached, log?: LogSoFar, leaving = false) => {
        const state = { reached, log: log ?? last.current?.log };
        if (!id || !state.log) return;
        last.current = { reached, log: state.log };
        fetch('/api/hyakki-exp', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: leaving,
            body: JSON.stringify({ id, version: PROGRESS_VERSION, consent: true, seq: ++seq.current, ...state }),
        }).catch(() => undefined);
    }, [id]);
    useEffect(() => {
        const leave = () => { if (last.current) save(last.current.reached, undefined, true); };
        const hidden = () => { if (document.hidden) leave(); };
        window.addEventListener('pagehide', leave);
        document.addEventListener('visibilitychange', hidden);
        return () => { window.removeEventListener('pagehide', leave); document.removeEventListener('visibilitychange', hidden); };
    }, [save]);

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
        // Nothing answered yet: say so once. Pressing again sends as it is, because answering is the visitor's choice.
        if (empty && !askedEmpty) { setAskedEmpty(true); return; }
        setSending(true);
        setFailed(false);
        try {
            const response = await fetch('/api/hyakki-exp', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, version: EXHIBIT_VERSION, consent: true, retelling, imagination, ratings, loreInterest: interest ?? null, log }),
            });
            if (!response.ok) throw new Error('save');
            last.current = null;   // the full record is in; nothing more to save
            setStep('done');
        } catch { setFailed(true); } finally { setSending(false); }
    }

    if (step === 'play') return <Hyakki exhibit={{ ...PLAY, onProgress: soFar => save('play', soFar), onFinish: ({ trace, chosen, openedIds, offeredEchoIds, skippedCall, skippedParade }) => {
        const played = { trace, chosen, openedIds, offeredEchoIds, skippedCall, skippedParade };
        setLog(played);
        setStep('story');
        save('story', played);
    } }} />;

    return <main className={styles.page}><section className={styles.sheet} key={step}>
        {step === 'consent' && <>
            <h1>百鬼夜行を呼ぶ</h1>
            <p>地図で好きな町を選び、気になる妖怪を五体誘ってください。五体がどんな仲間を呼ぶか、絵巻で見届けられます。</p>
            <h2>展示研究へのご協力</h2>
            <p>遊び終えたら、覚えている場面をあなたの言葉でお聞かせください。回答は、伝承から妖怪の名前や姿、物語をつくる「妖怪生成装置」の設計と研究発表に使います。</p>
            <p>「同意して遊ぶ」を押すと、遊んでいる間の操作を記録します。記録するのは、画面や妖怪の候補、地図を動かした操作、雲や絵巻を開いた順番、出典リンクや保存ボタンの操作と、開始からの経過時間です。途中でやめた場合も、そこまでの操作記録は残ります。アンケートの回答は「回答を送る」を押したときだけ送ります。氏名や地図のピン位置は保存しません。質問はどれも任意です。</p>
            <div className={styles.actions}><Link className={styles.ghost} href="/hyakki">研究に参加せず遊ぶ</Link>
                <button className={styles.primary} onClick={start}>同意して遊ぶ</button></div>
        </>}
        {step === 'story' && <>
            <p className={styles.progress}>アンケート 1 / 2</p>
            <h1>あなたの百鬼夜行</h1>
            <p>遊んでくださってありがとうございます。あと2画面、1〜2分ほどのアンケートにご協力ください。あなたの言葉が、この展示と研究のいちばんの手がかりになります。</p>
            <label className={styles.field}>今日の百鬼夜行を、ここにいなかった人に一つだけ話すとしたら、どんな話をしますか？
                <textarea rows={3} maxLength={800} value={retelling} onChange={e => setRetelling(e.target.value)} /></label>
            <label className={styles.field}>誘った一体を思い出してください。出会う前にどんな妖怪を想像しましたか？　そう思ったきっかけや、出会って印象が変わったところがあれば教えてください。
                <textarea rows={3} maxLength={800} value={imagination} onChange={e => setImagination(e.target.value)} /></label>
            <p>ひとことでも、空欄でも進めます。個人が分かる名前や連絡先は書かずにお答えください。</p>
            <div className={styles.actions}><a className={styles.ghost} href={HOME} onClick={() => save('quit', undefined, true)}>答えずに終了</a>
                <button className={styles.primary} onClick={() => { setStep('ratings'); save('ratings'); }}>次へ</button></div>
        </>}
        {step === 'ratings' && <>
            <p className={styles.progress}>アンケート 2 / 2</p>
            <h1>遊んでみてどうでしたか</h1>
            <p>いま遊んだゲームについて、気持ちに近い数字をタップしてください。1が「{ANCHORS[0]}」、4が「{ANCHORS[3]}」、7が「{ANCHORS[6]}」です。答えたい項目だけで送れます。</p>
            <fieldset className={styles.questions} disabled={sending}>
                <legend className={styles.groupTitle}>ゲームの体験</legend>
                {order.map(([key, label]) => <Rating key={key} label={label} value={ratings[key]} change={value => setRatings(old => ({ ...old, [key]: value }))} />)}
            </fieldset>
            <fieldset className={styles.questions} disabled={sending}><legend className={styles.groupTitle}>伝承への関心</legend>
                <Rating label={LORE_INTEREST} value={interest} change={setInterest} /></fieldset>
            <p className={styles.count} aria-live="polite">{PX_ITEMS.length + 1}問のうち {answered}問に回答</p>
            {askedEmpty && empty && <p role="status" className={styles.ask}>まだどの質問にも答えていません。一つだけでも答えていただけると助かります。このまま送る場合は、もう一度「回答を送る」を押してください。</p>}
            {failed && <p role="alert" className={styles.failed}>送信できませんでした。回答はこの画面に残っています。通信を確認して、もう一度お試しください。</p>}
            <div className={styles.actions}><button className={styles.ghost} disabled={sending} onClick={() => setStep('story')}>戻る</button>
                <button className={styles.primary} disabled={sending} onClick={send}>{sending ? '送信中…' : '回答を送る'}</button></div>
        </>}
        {step === 'done' && <><h1>ありがとうございました</h1><p>回答を受け取りました。</p>
            <div className={styles.actions}><a className={styles.primary} href={HOME}>展示の最初に戻る</a></div></>}
    </section></main>;
}

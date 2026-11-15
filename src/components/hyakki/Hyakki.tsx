'use client';
// /hyakki flow, screens 0-10 (see the brief): the map is the stage, one panel at the bottom talks to the child,
// and the queue of met yokai stays under it. All calls go through run() so a failure can be retried and a
// double tap cannot send twice. The pin lives in state only (the parade goes to it): it is never stored or logged, and "もう一度" clears it.
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Card, HyakkiMapProps, Light, Mist, Point, RegionKey } from '@/lib/hyakki-types';
import { CALLER_COLORS } from './colors';
import styles from './Hyakki.module.css';

const HyakkiMap = dynamic<HyakkiMapProps>(() => import('./HyakkiMap'), {
    ssr: false,
    loading: () => <div className={styles.mapLoading}>地図を読みこんでいます</div>,
});

const API = '/api/hyakki';
const TEAM = 5;
const REGIONS: { key: RegionKey; label: string }[] = [
    { key: 'hokkaido-tohoku', label: '北海道・東北' },
    { key: 'kanto', label: '関東' },
    { key: 'chubu', label: '中部' },
    { key: 'kinki', label: '近畿' },
    { key: 'chugoku-shikoku', label: '中国・四国' },
    { key: 'kyushu-okinawa', label: '九州・沖縄' },
];

class ApiError extends Error {
    constructor(public kind: 'network' | 'data' | 'request' | 'other') { super(kind); }
}
const REASONS: Record<ApiError['kind'], string> = {
    network: 'ネットワークにつながりませんでした。',
    data: 'いま、妖怪のデータを読みこめません。',
    request: '送った内容に問題がありました。',
    other: 'うまくいきませんでした。',
};

async function api<T>(url: string, init?: RequestInit): Promise<T> {
    let res: Response;
    try { res = await fetch(url, { cache: 'no-store', ...init }); } catch { throw new ApiError('network'); }
    let body: unknown = null;
    try { body = await res.json(); } catch { /* handled below */ }
    if (!res.ok || !body) throw new ApiError(res.status === 503 ? 'data' : res.status === 400 ? 'request' : 'other');
    return body as T;
}
const post = <T,>(payload: object) => api<T>(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

const placeText = (card: Card) => card.level === 'place' && card.place ? `${card.place}のあたり` : `${card.prefecture}のどこか`;


// The thought cloud: the recipe of public/hyakki/cloud.svg (every lobe once in the line colour and once, 4 units
// smaller, in the paper colour, so only the outer edge keeps a line), drawn wider with the same lobe sizes so a
// 63-character hint fits at 17px on a 400px screen. Scaled uniformly; never stretched.
const LOBES: [number, number, number][] = [
    [84, 58, 40], [134, 48, 44], [186, 52, 42], [238, 48, 44], [290, 58, 40], [330, 96, 34],
    [288, 124, 38], [232, 132, 40], [180, 130, 40], [128, 132, 40], [82, 124, 37], [50, 92, 36],
];
function Cloud() {
    return (
        <svg viewBox="0 0 368 196" aria-hidden="true" focusable="false">
            <g fill="var(--cloud-line)">
                {LOBES.map(([x, y, r], i) => <circle key={i} cx={x} cy={y} r={r} />)}
                <circle cx={34} cy={160} r={15} /><circle cx={12} cy={184} r={9} />
            </g>
            <g fill="var(--cloud-paper)">
                {LOBES.map(([x, y, r], i) => <circle key={i} cx={x} cy={y} r={r - 4} />)}
                <ellipse cx={190} cy={90} rx={140} ry={46} />
                <circle cx={34} cy={160} r={11} /><circle cx={12} cy={184} r={5.5} />
            </g>
        </svg>
    );
}
const HINT_LONG = 54;   // longer hints drop one size so they stay inside the cloud

type Failure = { reason: string; retry: () => void };

const tally = (lights: Light[], cutoff = Infinity) => {
    const counts = Array.from({ length: TEAM }, () => 0);
    for (const light of lights) if (light.order < cutoff) counts[light.caller] += 1;
    return counts;
};

// The queue keeps the count-up in its own state: about 10 s of updates re-render these slots, not the page and the map.
// While the five are calling (onCall set), each picture here is a button: on the map of Japan the five stand on
// top of each other, so this row is where the player taps them.
function Queue({ chosen, lights, lit, called, onCall }: { chosen: Card[]; lights: Light[]; lit: boolean; called: number[]; onCall?: (index: number) => void }) {
    // A caller's number appears once the player has made it call.
    const totals = useMemo(() => tally(lights), [lights]);
    const counts = totals.map((n, k) => (called.includes(k) ? n : 0));

    return (
        <ol className={onCall ? `${styles.queue} ${styles.calling}` : styles.queue} aria-label="行列">
            {Array.from({ length: TEAM }, (_, i) => {
                const card = chosen[i];
                const count = counts[i];
                return (
                    <li key={i} className={card ? styles.slot : `${styles.slot} ${styles.empty}`}
                        style={card ? { borderColor: CALLER_COLORS[i] } : undefined}
                        aria-label={card ? `${i + 1}番目 ${card.name}${lit ? `、よんだ仲間 ${count}体` : ''}` : `${i + 1}番目 まだいません`}>
                        {card ? <img src={card.picture} alt="" /> : <span aria-hidden="true">{i + 1}</span>}
                        {card && onCall && !called.includes(i) && (
                            <button type="button" className={styles.call} style={{ color: CALLER_COLORS[i] }} aria-label={`${card.name}に仲間をよんでもらう`} onClick={() => onCall(i)} />
                        )}
                        {card && lit && <span className={styles.count} style={{ color: CALLER_COLORS[i] }}>+{count}</span>}
                    </li>
                );
            })}
        </ol>
    );
}

// Screen 10: the line-up. One sheet with all hundred: the five the player chose in the middle with their pictures,
// each with the friends it called above and below it as silhouettes. The same drawing is what the player downloads.
const SHEET_W = 1600, SHEET_H = 1000;
const loadImage = (src: string) => new Promise<HTMLImageElement | null>(done => {
    const image = new Image();
    image.onload = () => done(image);
    image.onerror = () => done(null);
    image.src = src;
});
type SheetArt = { pictures: (HTMLImageElement | null)[]; shadows: (HTMLImageElement | null)[] };

function paintSheet(canvas: HTMLCanvasElement, art: SheetArt, chosen: Card[], lights: Light[], from: { label: string; n: number }[], font: string, opaque: boolean) {
    const g = canvas.getContext('2d');
    if (!g) return;
    canvas.width = SHEET_W; canvas.height = SHEET_H;
    g.clearRect(0, 0, SHEET_W, SHEET_H);
    if (opaque) {
        const night = g.createRadialGradient(SHEET_W / 2, SHEET_H / 2, 80, SHEET_W / 2, SHEET_H / 2, SHEET_W * 0.62);
        night.addColorStop(0, '#2b2449'); night.addColorStop(1, '#100e1a');
        g.fillStyle = night; g.fillRect(0, 0, SHEET_W, SHEET_H);
    }
    g.textBaseline = 'middle';
    g.shadowColor = '#000'; g.shadowBlur = 8;
    g.fillStyle = '#f2cf85'; g.textAlign = 'left'; g.font = `700 38px ${font}`;
    g.fillText('百鬼夜行の顔ぶれ', 40, 52);
    g.fillStyle = '#c4bedb'; g.textAlign = 'right'; g.font = `22px ${font}`;
    g.fillText(from.map(r => `${r.label} ${r.n}`).join('   '), SHEET_W - 40, 52);
    g.shadowBlur = 0;

    const midY = 470, bigR = 92, column = SHEET_W / TEAM;
    chosen.forEach((card, k) => {
        const cx = column * (k + 0.5), color = CALLER_COLORS[k];
        // friends: alternately above and below their caller, four across, nearest first
        const mine = lights.map((l, index) => ({ l, index })).filter(o => o.l.caller === k).sort((a, b) => a.l.order - b.l.order);
        const tiers = Math.max(1, Math.ceil(mine.length / 8));
        const gap = Math.min(62, 212 / Math.max(1, tiers - 1)), r = Math.min(27, gap * 0.45);
        mine.forEach((o, n) => {
            const up = n % 2 === 0, slot = Math.floor(n / 2), col = slot % 4, tier = Math.floor(slot / 4);
            const x = cx + (col - 1.5) * 66 + (tier % 2 ? 14 : -14);
            const y = up ? midY - bigR - 44 - tier * gap : midY + bigR + 124 + tier * gap;
            g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fillStyle = color; g.fill();
            const shadow = art.shadows[o.index];
            if (shadow) {
                const box = r * 1.45, k2 = Math.min(box / shadow.width, box / shadow.height);
                g.drawImage(shadow, x - (shadow.width * k2) / 2, y - (shadow.height * k2) / 2, shadow.width * k2, shadow.height * k2);
            }
        });
        // the chosen one: its picture in a ring of its colour
        g.save();
        g.beginPath(); g.arc(cx, midY, bigR, 0, Math.PI * 2); g.clip();
        g.fillStyle = '#c3b8dc'; g.fillRect(cx - bigR, midY - bigR, bigR * 2, bigR * 2);
        const picture = art.pictures[k];
        if (picture) {
            const k2 = Math.max((bigR * 2) / picture.width, (bigR * 2) / picture.height);
            g.drawImage(picture, cx - (picture.width * k2) / 2, midY - bigR, picture.width * k2, picture.height * k2);
        }
        g.restore();
        g.beginPath(); g.arc(cx, midY, bigR, 0, Math.PI * 2); g.lineWidth = 7; g.strokeStyle = color; g.stroke();
        g.shadowColor = '#000'; g.shadowBlur = 8; g.textAlign = 'center';
        g.fillStyle = '#f1eef8'; g.font = `700 34px ${font}`;
        g.fillText(card.name, cx, midY + bigR + 34, column - 30);
        g.fillStyle = '#c4bedb'; g.font = `20px ${font}`;
        g.fillText(`${placeText(card)}  +${mine.length}`, cx, midY + bigR + 70, column - 30);
        g.shadowBlur = 0;
    });
}

function Results({ chosen, lights, region, onRestart }: { chosen: Card[]; lights: Light[]; region: RegionKey | null; onRestart: () => void }) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const art = useRef<SheetArt | null>(null);
    const [ready, setReady] = useState(false);
    // The five were all met in the player's own region.
    const from = useMemo(() => REGIONS.map(r => ({ label: r.label, n: lights.filter(l => l.region === r.key).length + (r.key === region ? chosen.length : 0) })), [lights, region, chosen]);

    useEffect(() => {
        let alive = true;
        void Promise.all([Promise.all(chosen.map(c => loadImage(c.picture))), Promise.all(lights.map(l => loadImage(l.silhouette)))]).then(([pictures, shadows]) => {
            const canvas = canvasRef.current;
            if (!alive || !canvas) return;
            art.current = { pictures, shadows };
            paintSheet(canvas, art.current, chosen, lights, from, getComputedStyle(canvas).fontFamily, false);
            setReady(true);
        });
        return () => { alive = false; };
    }, [chosen, lights, from]);

    // The downloaded picture has its own night sky; on screen the sheet is clear and the map shows through.
    const download = () => {
        const shown = canvasRef.current;
        if (!shown || !art.current) return;
        const canvas = document.createElement('canvas');
        paintSheet(canvas, art.current, chosen, lights, from, getComputedStyle(shown).fontFamily, true);
        canvas.toBlob(blob => {
            if (!blob) return;
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = 'hyakki-yagyo.png';
            link.click();
            setTimeout(() => URL.revokeObjectURL(link.href), 1000);
        }, 'image/png');
    };

    return (
        <div className={styles.finale}>
            <canvas ref={canvasRef} className={styles.lineup} width={SHEET_W} height={SHEET_H} role="img"
                aria-label={`百鬼夜行の顔ぶれ。${chosen.map(c => c.name).join('、')}と、よばれた仲間${lights.length}体。${from.map(r => `${r.label}${r.n}体`).join('、')}`} />
            <ul className={styles.sources} aria-label="話と絵のもと">
                {chosen.map((card, i) => (
                    <li key={card.id}>
                        <span className={styles.dot} style={{ background: CALLER_COLORS[i] }} aria-hidden="true" />
                        <strong>{card.name}</strong>
                        <a href={card.storyUrl} target="_blank" rel="noopener noreferrer">話のもと</a>
                        <a href={card.pictureSourceUrl} target="_blank" rel="noopener noreferrer">絵のもと</a>
                    </li>
                ))}
            </ul>
            <div className={styles.actions}>
                <button type="button" className={styles.ghost} onClick={onRestart}>もう一度</button>
                <Link href="/map" className={styles.ghost}>地図にもどる</Link>
                <button type="button" className={styles.primary} onClick={download} disabled={!ready}>画像をダウンロード</button>
            </div>
        </div>
    );
}

export default function Hyakki() {
    const [screen, setScreen] = useState(0);
    const [reduced, setReduced] = useState(false);
    const [region, setRegion] = useState<RegionKey | null>(null);
    const [pin, setPin] = useState<Point | null>(null);
    const [buddies, setBuddies] = useState<Card[]>([]);
    const [chosen, setChosen] = useState<Card[]>([]);
    const [mists, setMists] = useState<Mist[]>([]);
    const [selected, setSelected] = useState<string | null>(null);
    const [peeked, setPeeked] = useState<string[]>([]);
    const [called, setCalled] = useState<number[]>([]);
    const [met, setMet] = useState<Card | null>(null);
    const [lights, setLights] = useState<Light[]>([]);
    const [busy, setBusy] = useState(false);
    const [failure, setFailure] = useState<Failure | null>(null);
    const busyRef = useRef(false);
    const generation = useRef(0);
    const panelRef = useRef<HTMLDivElement>(null);
    const stageRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<HTMLDivElement>(null);

    // Screen 0 is skipped for people who asked for less motion.
    useEffect(() => {
        const query = window.matchMedia('(prefers-reduced-motion: reduce)');
        setReduced(query.matches);
        const onChange = () => setReduced(query.matches);
        query.addEventListener('change', onChange);
        const timer = query.matches ? undefined : setTimeout(() => setScreen(s => (s === 0 ? 1 : s)), 1900);
        if (query.matches) setScreen(s => (s === 0 ? 1 : s));
        return () => { query.removeEventListener('change', onChange); clearTimeout(timer); };
    }, []);

    // Move keyboard and screen reader focus to the new panel after every step.
    useEffect(() => { if (screen > 0) panelRef.current?.focus({ preventScroll: true }); }, [screen]);

    // The map shifts its centre up by the height the panel covers: panel top to the bottom of the map area.
    useEffect(() => {
        const stage = stageRef.current, map = mapRef.current, panel = panelRef.current;
        if (!stage || !map) return;
        const update = () => map.style.setProperty('--hyakki-map-inset-bottom', `${panel ? Math.max(0, Math.round(stage.clientHeight - panel.offsetTop)) : 0}`);
        update();
        const observer = new ResizeObserver(update);
        observer.observe(stage);
        if (panel) observer.observe(panel);
        return () => observer.disconnect();
    }, [screen > 0]);   // eslint-disable-line react-hooks/exhaustive-deps

    const run = useCallback(async (job: (alive: () => boolean) => Promise<void>) => {
        if (busyRef.current) return;
        busyRef.current = true;
        setBusy(true);
        setFailure(null);
        const mine = generation.current;
        try {
            await job(() => mine === generation.current);
        } catch (e) {
            if (mine === generation.current) setFailure({ reason: REASONS[e instanceof ApiError ? e.kind : 'other'], retry: () => { void run(job); } });
        } finally {
            if (mine === generation.current) { busyRef.current = false; setBusy(false); }
        }
    }, []);

    const chooseRegion = (key: RegionKey) => { setRegion(key); setPin(null); setScreen(2); };

    const findBuddies = () => {
        if (!region || !pin) return;
        void run(async alive => {
            const query = new URLSearchParams({ region, lat: String(pin.lat), lon: String(pin.lon) });
            const res = await api<{ buddies: Card[] }>(`${API}?${query}`);
            if (!alive()) return;
            setBuddies(res.buddies);
            setScreen(3);
        });
    };

    const pickBuddy = (card: Card) => {
        if (!region) return;
        void run(async alive => {
            const res = await post<{ mists: Mist[] }>({ action: 'mists', region, chosen: [card.id], shown: [] });
            if (!alive()) return;
            setChosen([card]);
            setMists(res.mists);
            setSelected(null); setPeeked([]);
            setScreen(4);
        });
    };

    const meet = (id: string) => {
        void run(async alive => {
            const res = await post<{ card: Card }>({ action: 'meet', id });
            if (!alive()) return;
            setMet(res.card);
            setScreen(6);
        });
    };

    // The card closes first, then the new mists arrive, so the player sees the same mists thicken or thin.
    const next = () => {
        if (!met || !region) return;
        const all = [...chosen, met];
        const shown = mists.map(m => m.id);
        setChosen(all);
        setMet(null);
        setSelected(null);
        if (all.length >= TEAM) { setMists([]); setScreen(7); summon(all.map(c => c.id)); return; }
        setMists(mists.filter(m => m.id !== met.id));
        setScreen(4);
        void run(async alive => {
            const [res] = await Promise.all([
                post<{ mists: Mist[] }>({ action: 'mists', region, chosen: all.map(c => c.id), shown }),
                wait(reduced ? 0 : 800),
            ]);
            if (!alive()) return;
            setMists(res.mists);
            // Clouds of mists that are still there stay open.
            setPeeked(open => open.filter(id => res.mists.some(m => m.id === id)));
        });
    };

    const summon = (ids: string[]) => {
        void run(async alive => {
            const res = await post<{ lights: Light[] }>({ action: 'summon', chosen: ids });
            if (!alive()) return;
            setLights(res.lights);
            setCalled(reduced ? [0, 1, 2, 3, 4] : []);
            setScreen(8);
        });
    };

    const restart = () => {
        generation.current += 1;
        busyRef.current = false;
        setBusy(false);
        setFailure(null);
        setRegion(null); setPin(null); setBuddies([]); setChosen([]); setMists([]);
        setSelected(null); setPeeked([]); setCalled([]); setMet(null); setLights([]);
        setScreen(1);
    };

    // Map callbacks can fire late (a skipped wave still ends), so they only move the screen they belong to.
    const onSummoned = useCallback(() => setScreen(s => (s === 8 ? 9 : s)), []);
    const onParaded = useCallback(() => setScreen(s => (s === 9 ? 10 : s)), []);
    const onFigure = useCallback((index: number) => setCalled(done => (done.includes(index) ? done : [...done, index])), []);
    const onMist = useCallback((id: string) => {
        if (busyRef.current) return;
        setSelected(id);
        setPeeked(open => (open.includes(id) ? open : [...open, id]));
        setScreen(s => (s === 4 || s === 5 ? 5 : s));
    }, []);

    // Memoised: the map rebuilds its parade plan whenever this array's identity changes.
    const figures = useMemo(() => (met ? [...chosen, met] : chosen), [chosen, met]);
    const selectedMist = mists.find(m => m.id === selected) ?? null;
    const lit = screen >= 8;

    const mapProps: HyakkiMapProps = {
        view: screen <= 1 || lit ? 'japan' : (region ?? 'japan'),
        still: reduced,
        figures,
    };
    if (screen === 1) mapProps.onRegion = chooseRegion;
    if (screen === 2) mapProps.onPick = setPin;
    if (screen >= 2) mapProps.pin = pin;   // the parade ends at the player's town
    if (screen >= 4 && screen <= 6) { mapProps.mists = mists; mapProps.peeked = peeked; if (screen !== 6) mapProps.onMist = onMist; }
    if (lit) {
        mapProps.lights = lights;
        mapProps.summon = screen === 8 ? 'wave' : 'on';
        mapProps.onSummoned = onSummoned;
        mapProps.parade = screen === 9;
        mapProps.called = called;
        mapProps.sheet = screen === 10;
        if (screen === 8) mapProps.onFigure = onFigure;
        mapProps.onParaded = onParaded;
    }

    return (
        <main className={styles.page}>
            <div className={styles.stage} ref={stageRef}>
                <div className={styles.map} ref={mapRef}><HyakkiMap {...mapProps} /></div>
                {screen > 0 && <Link href="/map" className={styles.back}>← 地図</Link>}

                {screen === 0 && (
                    <button type="button" className={`${styles.intro} ${styles.introFall}`} onClick={() => setScreen(1)} aria-label="はじめる">
                        <span className={styles.title}><ruby>百鬼夜行<rt>ひゃっきやぎょう</rt></ruby></span>
                        <span className={styles.introSub}>百鬼夜行を、あなたの町によぼう</span>
                    </button>
                )}

                {screen > 0 && (
                    <div className={`${styles.panel} ${screen === 10 ? styles.sheet : ''} ${screen === 5 || screen === 3 || screen === 6 ? styles.bare : ''} ${screen === 3 ? styles.picks : ''}`} ref={panelRef} tabIndex={-1} aria-live="polite">
                        {failure && (
                            <div className={styles.failure} role="alert">
                                <p>{failure.reason}</p>
                                <button type="button" className={styles.primary} onClick={failure.retry} disabled={busy}>もう一度ためす</button>
                            </div>
                        )}

                        {screen === 1 && (
                            <>
                                <h1 className={styles.head}>どの地方に、百鬼夜行をよぶ?</h1>
                                <div className={styles.regions}>
                                    {REGIONS.map(r => <button key={r.key} type="button" className={styles.choice} onClick={() => chooseRegion(r.key)}>{r.label}</button>)}
                                </div>
                            </>
                        )}

                        {screen === 2 && (
                            <div className={styles.strip}>
                                <div className={styles.msg}>
                                    <h1 className={styles.head}>あなたの町をタップ</h1>
                                </div>
                                <div className={`${styles.actions} ${styles.pair}`}>
                                    <button type="button" className={styles.ghost} onClick={() => { setPin(null); setScreen(1); }} disabled={busy}>地方にもどる</button>
                                    <button type="button" className={styles.primary} onClick={findBuddies} disabled={!pin || busy}>{busy ? 'さがしています…' : 'ここにする'}</button>
                                </div>
                            </div>
                        )}

                        {screen === 3 && (
                            <>
                                <h1 className={styles.head}>行列の先頭をえらぶ</h1>
                                <ul className={styles.buddies}>
                                    {buddies.map(card => (
                                        <li key={card.id}>
                                            <button type="button" className={styles.buddy} onClick={() => pickBuddy(card)} disabled={busy}>
                                                <img src={card.picture} alt="" className={styles.thumb} />
                                                <strong className={styles.slip}>{card.name}</strong>
                                                {card.tease && <span className={styles.buddyTease}>{card.tease}</span>}
                                                <span className={styles.where}>{placeText(card)}</span>
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            </>
                        )}

                        {screen === 4 && (
                            <div className={styles.strip}>
                                <div className={styles.msg}>
                                    <h1 className={styles.head}>気になる雲をタップ</h1>
                                </div>
                                <span className={styles.left}>あと{TEAM - chosen.length}体</span>
                            </div>
                        )}

                        {screen === 5 && selectedMist && (
                            <div className={styles.encounter}>
                                <div className={styles.cloud}>
                                    <Cloud />
                                    <div className={styles.cloudText}>
                                        <p className={`${styles.hint} ${selectedMist.hint.length > HINT_LONG ? styles.hintLong : ''}`}>{selectedMist.hint}</p>
                                    </div>
                                </div>
                                <div className={styles.meetRow}>
                                    <img src={`${API}?silhouette=${encodeURIComponent(selectedMist.id)}`} alt="妖怪の影" className={styles.shadow} />
                                    <span className={styles.near}>{selectedMist.level === 'place' ? 'このあたり' : 'この県のどこか'}</span>
                                    <div className={styles.actions}>
                                        {peeked.length > 1 && (
                                            <div className={styles.peeks} role="group" aria-label="のぞいたもや">
                                                {peeked.map((id, i) => (
                                                    <button key={id} type="button" className={styles.peek} aria-pressed={id === selected} aria-label={`${i + 1}つ目ののぞいたもや`} onClick={() => setSelected(id)}>
                                                        <img src={`${API}?silhouette=${encodeURIComponent(id)}`} alt="" />
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                        <button type="button" className={styles.primary} onClick={() => meet(selectedMist.id)} disabled={busy}>{busy ? 'むかっています…' : 'この妖怪をさそう'}</button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {screen === 6 && met && (
                            <div className={styles.met}>
                                <h1 className={styles.joined}>{met.name}が仲間になった</h1>
                                <div className={styles.metCard}>
                                    <img src={met.picture} alt="" className={styles.metPicture} />
                                    <span className={styles.cardHead}>
                                        <strong className={`${styles.name} ${styles.metName}`}>{met.name}</strong>
                                        <span className={styles.where}>{placeText(met)}</span>
                                    </span>
                                    {met.recordName !== met.name && <p className={styles.recordName}>記録の名前: {met.recordName}</p>}
                                    <p className={styles.desc}>{met.desc}</p>
                                </div>
                                <button type="button" className={styles.primary} onClick={next} disabled={busy}>
                                    {chosen.length + 1 >= TEAM ? '5体で、百鬼夜行をよぶ' : `つぎの仲間をさがす(あと${TEAM - chosen.length - 1}体)`}
                                </button>
                            </div>
                        )}

                        {screen === 7 && (
                            <div className={styles.strip}>
                                <div className={styles.msg}>
                                    <h1 className={styles.head}>5体そろいました</h1>
                                </div>
                            </div>
                        )}

                        {screen === 8 && (
                            <div className={styles.strip}>
                                <div className={styles.msg}>
                                    <h1 className={styles.head}>{called.length < TEAM ? '下の5体をタップして、似た仲間をよぶ' : '100体そろいました'}</h1>
                                </div>
                                <div className={styles.actions}>
                                    <button type="button" className={styles.ghost} onClick={() => { setCalled([0, 1, 2, 3, 4]); setScreen(9); }}>とばす</button>
                                </div>
                            </div>
                        )}

                        {screen === 9 && (
                            <div className={styles.strip}>
                                <div className={styles.msg}>
                                    <h1 className={styles.head}>あなたの町へ</h1>
                                </div>
                                <div className={styles.actions}>
                                    <button type="button" className={styles.ghost} onClick={() => setScreen(10)}>とばす</button>
                                </div>
                            </div>
                        )}

                        {screen === 10 && <Results chosen={chosen} lights={lights} region={region} onRestart={restart} />}
                    </div>
                )}
            </div>

            {screen > 0 && <Queue chosen={chosen} lights={lights} lit={lit} called={called} onCall={screen === 8 ? onFigure : undefined} />}
        </main>
    );
}

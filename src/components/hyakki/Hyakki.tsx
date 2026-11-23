'use client';
// /hyakki flow, screens 0-10 (see the brief): the map is the stage, one panel at the bottom talks to the child,
// and the queue of met yokai stays under it. All calls go through run() so a failure can be retried and a
// double tap cannot send twice. The pin lives in state only (the parade goes to it): it is never stored or logged, and "もう一度" clears it.
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Card, HyakkiMapProps, Light, Mist, Point, RegionKey } from '@/lib/hyakki-types';
import { MAX_EVENTS, type ExhibitTrace, type Track } from '@/lib/hyakki-exhibit';
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

/** The exhibit's own version of the play. /hyakki passes none; the study page (HyakkiExp) decides every field, so
 *  the exhibit is designed there and nothing here names its route or its wording. Passing it turns the trace on. */
export type HyakkiExhibit = {
    onFinish: (log: PlayLog) => void;
    back: { href: string; label: string };   // the way out while playing; a full page load, so the host starts fresh
    finishLabel: string;                     // the button that ends the play on the scroll
    mapGuide: boolean;                       // explain the map gestures where the town is chosen
};

/** What the study page (/hyakki/exp) receives when a play ends. The player's town is not part of it. */
export type PlayLog = {
    trace: ExhibitTrace;
    region: RegionKey | null;
    seconds: number;            // from choosing a region to leaving the line-up
    peeks: number[];            // clouds opened before each of the four invitations
    chosen: string[];           // ids of the five
    offeredEchoIds: string[];   // available in this parade, including when the call was skipped
    openedIds: string[];        // distinct cards actually opened in the scroll
    friends: number[];          // how many each of the five drew in
    nearAll: number | null;     // mean likeness of the 95 to their callers
    nearAloud: number | null;   // the same, for those that answered aloud
    skippedCall: boolean; skippedParade: boolean;
    opened: number;             // figures opened on the line-up
    saved: boolean;             // the line-up was downloaded
};

// Screen 10: the line-up, composed like a picture scroll of the night parade: one dense crowd moving left. The five
// the player chose are large and stand clear in front; the friends each one called press round it, the most
// similar nearest, overlapping as the figures in the scrolls do. Any figure can be tapped to read its story.
// The same layout is painted on a canvas for the download.
const SHEET_W = 1600, SHEET_H = 900;
type Spot = { x: number; y: number; w: number; caller: number; light: number; flip: boolean };   // light -1: one of the five

// On an upright phone the sheet stands upright too: the same layout with its two axes exchanged.
function layoutScroll(chosen: Card[], lights: Light[], tall = false): Spot[] {
    const crowd: Spot[] = [], leads: Spot[] = [];
    const seen = new Map<string, number>();
    chosen.forEach((_, k) => {
        const cx = 200 + k * 280, cy = 455 + Math.sin(k * 1.9) * 45, big = 220;
        leads.push({ x: cx - big / 2, y: cy - big * 0.62, w: big, caller: k, light: -1, flip: false });
        // the nearer a friend is to the one that called it, the closer it stands and the larger it is drawn
        const mine = lights.map((l, index) => ({ l, index })).filter(o => o.l.caller === k).sort((a, b) => b.l.near - a.l.near);
        mine.forEach((o, n) => {
            const far = (n + 0.5) / mine.length;
            const angle = n * 2.39996 + k, reach = 125 + Math.sqrt(far) * Math.min(250, 70 + 5 * mine.length);
            const w = 112 - 46 * Math.sqrt(far), h = w * 1.25;
            // the same picture can come twice (two places, one kind of yokai): every other one faces the other way
            const times = seen.get(o.l.picture) ?? 0;
            seen.set(o.l.picture, times + 1);
            crowd.push({
                x: Math.min(1480 - w, Math.max(16, cx + Math.cos(angle) * reach * 1.05 - w / 2)),
                y: Math.min(SHEET_H - h - 14, Math.max(40, cy + Math.sin(angle) * reach * 0.92 - h / 2)),
                w, caller: k, light: o.index, flip: times % 2 === 1,
            });
        });
    });
    // far figures first, the five last: they are drawn on top
    const wide = [...crowd.sort((a, b) => a.y + a.w * 1.25 - (b.y + b.w * 1.25)), ...leads];
    if (!tall) return wide;
    return wide.map(s => { const h = s.w * 1.25, cx = s.x + s.w / 2, cy = s.y + h / 2; return { ...s, x: cy - s.w / 2, y: cx - h / 2 }; });
}

const loadImage = (src: string) => new Promise<HTMLImageElement | null>(done => {
    const image = new Image();
    image.onload = () => done(image);
    image.onerror = () => done(null);
    image.src = src;
});
const PAPER = '#eadfc6', INK = '#3a2c1c';
// Japan, faint, behind the crowd: the whole country from Okinawa to Hokkaido in the 1600x900 space. Outline only.
const landXY = (tall: boolean) => (tall
    ? { x: (lon: number) => 450 + (lon - 137.2) * 37.5, y: (lat: number) => 800 - (lat - 35.8) * 47.8 }
    : { x: (lon: number) => 760 + (lon - 137.2) * 36, y: (lat: number) => 450 - (lat - 35.8) * 45.9 });
type Outline = { prefectures: { polys: number[][][] }[] };
const landPath = (file: Outline, tall: boolean) => file.prefectures.flatMap(p => p.polys).flat().filter(ring => ring.length >= 12).map(ring => {
    let d = '';
    for (let i = 0; i < ring.length; i += 2) d += `${i ? 'L' : 'M'}${landXY(tall).x(ring[i]).toFixed(1)} ${landXY(tall).y(ring[i + 1]).toFixed(1)}`;
    return `${d}Z`;
}).join('');
// Kasumi, the banded mist of the picture scrolls: four round-ended bars, stepped.
const KASUMI: [number, number, number][] = [[96, 2, 236], [18, 15, 312], [128, 28, 262], [0, 41, 214], [160, 54, 150]];   // x, y, width of each bar; all 11 high

async function paintScroll(chosen: Card[], lights: Light[], spots: Spot[], font: string, land: string, tall: boolean) {
    const W = tall ? SHEET_H : SHEET_W, H = tall ? SHEET_W : SHEET_H;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const g = canvas.getContext('2d');
    if (!g) return null;
    g.fillStyle = PAPER; g.fillRect(0, 0, W, H);
    const kasumi = (x: number, y: number, k: number) => {
        g.save(); g.translate(x, y); g.scale(k, k);
        const fade = g.createLinearGradient(0, 0, 400, 0);
        fade.addColorStop(0, '#c9a24e00'); fade.addColorStop(0.25, '#c9a24e59'); fade.addColorStop(0.75, '#c9a24e59'); fade.addColorStop(1, '#c9a24e00');
        g.fillStyle = fade;
        g.beginPath(); for (const [bx, by, bw] of KASUMI) g.roundRect(bx, by, bw, 11, 5.5); g.fill(); g.restore();
    };
    kasumi(-60, 60, tall ? 1.3 : 1.9); kasumi(W - 840, H - 170, tall ? 1.5 : 2.1);
    if (land) { const path = new Path2D(land); g.fillStyle = '#3a2c1c12'; g.fill(path); g.lineWidth = 1; g.strokeStyle = '#3a2c1c38'; g.stroke(path); }
    const images = await Promise.all(spots.map(s => loadImage(s.light < 0 ? chosen[s.caller].picture : lights[s.light].picture)));
    const cut = document.createElement('canvas');
    const c = cut.getContext('2d');
    spots.forEach((s, n) => {
        const image = images[n], w = Math.round(s.w), h = Math.round(s.w * 1.25);
        if (!image || !c) return;
        // the picture, cover-fitted from the top, fading out towards its edges so that it sits on the paper
        cut.width = w; cut.height = h;
        const k = Math.max(w / image.width, h / image.height);
        c.drawImage(image, (w - image.width * k) / 2, 0, image.width * k, image.height * k);
        c.globalCompositeOperation = 'destination-in';
        c.save(); c.translate(w / 2, h * 0.47); c.scale(1, h / w);
        const fade = c.createRadialGradient(0, 0, w * 0.3, 0, 0, w * 0.52);
        fade.addColorStop(0, '#000'); fade.addColorStop(1, 'transparent');
        c.fillStyle = fade; c.fillRect(-w, -w, w * 2, w * 2);
        c.restore(); c.globalCompositeOperation = 'source-over';
        g.globalCompositeOperation = 'multiply';
        g.save();
        if (s.flip) { g.translate(s.x + w, s.y); g.scale(-1, 1); } else g.translate(s.x, s.y);
        g.drawImage(cut, 0, 0);
        g.restore();
        g.globalCompositeOperation = 'source-over';
    });
    const upright = (text: string, x: number, y: number, size: number) => [...text].forEach((ch, n) => g.fillText(ch, x, y + n * size * 1.12));
    g.textAlign = 'center'; g.textBaseline = 'top'; g.fillStyle = INK;
    spots.filter(s => s.light < 0).forEach(s => {
        const name = chosen[s.caller].name, size = 26, x = s.x + s.w - 6, y = s.y - 4, tall = [...name].length * size * 1.12 + 10;
        g.fillStyle = PAPER; g.fillRect(x - size * 0.75, y - 6, size * 1.5, tall);
        g.lineWidth = 3; g.strokeStyle = CALLER_COLORS[s.caller]; g.strokeRect(x - size * 0.75, y - 6, size * 1.5, tall);
        g.fillStyle = INK; g.font = `700 ${size}px ${font}`; upright(name, x, y, size);
    });
    g.fillStyle = INK; g.font = `700 60px ${font}`;
    if (tall) { g.textBaseline = 'alphabetic'; g.fillText('百鬼夜行', W / 2, H - 36); } else upright('百鬼夜行', 1540, 80, 60);
    return canvas;
}

type ScrollLog = Pick<PlayLog, 'opened' | 'openedIds' | 'saved'>;
function Results({ chosen, lights, onRestart, onFinish, finishLabel, track }: { chosen: Card[]; lights: Light[]; onRestart: () => void; onFinish?: (seen: ScrollLog) => void; finishLabel?: string; track?: Track }) {
    const seen = useRef({ opened: new Set<string>(), saved: false });
    const sheetRef = useRef<HTMLDivElement>(null);
    const [open, setOpen] = useState<Card | null>(null);
    const [trouble, setTrouble] = useState(false);
    const [land, setLand] = useState('');
    const [tall, setTall] = useState(false);
    useEffect(() => {
        const query = window.matchMedia('(max-width: 700px) and (orientation: portrait)');
        const update = () => setTall(query.matches);
        update();
        query.addEventListener('change', update);
        return () => query.removeEventListener('change', update);
    }, []);
    const W = tall ? SHEET_H : SHEET_W, H = tall ? SHEET_W : SHEET_H;
    const spots = useMemo(() => layoutScroll(chosen, lights, tall), [chosen, lights, tall]);
    useEffect(() => {
        let alive = true;
        fetch('/hyakki/japan.json').then(r => r.json()).then((file: Outline) => { if (alive) setLand(landPath(file, tall)); }).catch(() => undefined);
        return () => { alive = false; };
    }, [tall]);
    const show = (spot: Spot) => {
        const display = (card: Card) => {
            track?.('scroll_open', [card.id]);
            seen.current.opened.add(card.id);
            setOpen(card);
        };
        setTrouble(false);
        if (spot.light < 0) { display(chosen[spot.caller]); return; }
        post<{ card: Card }>({ action: 'meet', id: lights[spot.light].id }).then(res => display(res.card), () => setTrouble(true));
    };

    const download = async () => {
        track?.('download_request');
        seen.current.saved = true;
        const canvas = await paintScroll(chosen, lights, spots, sheetRef.current ? getComputedStyle(sheetRef.current).fontFamily : 'serif', land, tall);
        canvas?.toBlob(blob => {
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
            <div className={tall ? `${styles.scrollSheet} ${styles.tall}` : styles.scrollSheet} ref={sheetRef}>
                <svg className={styles.scrollMap} viewBox={`0 0 ${W} ${H}`} aria-hidden="true"><path d={land} /></svg>
                <span className={styles.scrollTitle} aria-hidden="true">百鬼夜行</span>
                {spots.map((s, n) => {
                    const big = s.light < 0;
                    return (
                        <button key={n} type="button" className={big ? `${styles.walker} ${styles.lead}` : lights[s.light].twin ? styles.walker : `${styles.walker} ${styles.distant}`} onClick={() => show(s)}
                            aria-label={big ? `${chosen[s.caller].name}の話を見る` : '仲間の話を見る'}
                            style={{ left: `${(s.x / W) * 100}%`, top: `${(s.y / H) * 100}%`, width: `${(s.w / W) * 100}%`, zIndex: n + 1, color: CALLER_COLORS[s.caller] }}>
                            <img src={big ? chosen[s.caller].picture : lights[s.light].picture} alt="" style={s.flip ? { transform: 'scaleX(-1)' } : undefined} />
                            {big && <strong>{chosen[s.caller].name}</strong>}
                        </button>
                    );
                })}
                {open && (
                    <div className={styles.lore} role="dialog" aria-label={open.name}>
                        <img src={open.picture} alt="" />
                        <span className={styles.cardHead}>
                            <strong className={styles.name}>{open.name}</strong>
                            <span className={styles.where}>{placeText(open)}</span>
                        </span>
                        {open.recordName !== open.name && <p className={styles.recordName}>記録の名前: {open.recordName}</p>}
                        <p className={styles.desc}>{open.desc}</p>
                        <p className={styles.loreFoot}>
                            <a href={open.storyUrl} onClick={() => track?.('story_link', [open.id])} target="_blank" rel="noopener noreferrer">話のもと</a>
                            <a href={open.pictureSourceUrl} onClick={() => track?.('image_link', [open.id])} target="_blank" rel="noopener noreferrer">絵のもと</a>
                            <button type="button" onClick={() => { track?.('scroll_close', [open.id]); setOpen(null); }}>とじる</button>
                        </p>
                    </div>
                )}
            </div>
            <div className={styles.actions}>
                <span className={styles.tapNote}>{trouble ? '話を読みこめませんでした。もう一度タップしてください。' : '妖怪をタップすると、話が読めます。'}</span>
                {onFinish ? (
                    <>
                        <button type="button" className={styles.ghost} onClick={() => { void download(); }}>画像をダウンロード</button>
                        <button type="button" className={styles.primary} onClick={() => onFinish({ opened: seen.current.opened.size, openedIds: [...seen.current.opened], saved: seen.current.saved })}>{finishLabel}</button>
                    </>
                ) : (
                    <>
                        <button type="button" className={styles.ghost} onClick={onRestart}>もう一度</button>
                        <Link href="/map" className={styles.ghost}>地図にもどる</Link>
                        <button type="button" className={styles.primary} onClick={() => { void download(); }}>画像をダウンロード</button>
                    </>
                )}
            </div>
        </div>
    );
}

export default function Hyakki({ exhibit }: { exhibit?: HyakkiExhibit } = {}) {
    const onFinish = exhibit?.onFinish;
    const study = useRef({ t0: 0, round: new Set<string>(), peeks: [] as number[], skippedCall: false, skippedParade: false });
    const [screen, setScreen] = useState(0);
    const recording = !!onFinish;
    const timeline = useRef<ExhibitTrace>({ version: 1, events: [], dropped: 0 });
    const clock = useRef({ start: 0, stage: -1 });
    const track = useCallback<Track>((kind, ids = []) => {
        if (!recording) return;
        const trace = timeline.current;
        if (trace.events.length >= MAX_EVENTS) { trace.dropped++; return; }
        trace.events.push({ ms: Math.round(performance.now() - clock.current.start), stage: clock.current.stage, kind, ids });
    }, [recording]);
    useEffect(() => {
        if (!recording || clock.current.stage === screen) return;
        if (clock.current.stage < 0) clock.current.start = performance.now();
        clock.current.stage = screen;
        track('stage');
    }, [screen, recording, track]);
    useEffect(() => {
        if (!recording) return;
        const visibility = () => track(document.hidden ? 'page_hidden' : 'page_visible');
        document.addEventListener('visibilitychange', visibility);
        return () => document.removeEventListener('visibilitychange', visibility);
    }, [recording, track]);
    const [reduced, setReduced] = useState(false);
    useEffect(() => { if (reduced) track('reduced_motion'); }, [reduced, track]);
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

    // Full screen, where the browser has it (an iPhone does not: the button is then not shown).
    const [canFill, setCanFill] = useState(false);
    const [filled, setFilled] = useState(false);
    useEffect(() => {
        setCanFill(document.fullscreenEnabled);
        const onChange = () => setFilled(document.fullscreenElement !== null);
        document.addEventListener('fullscreenchange', onChange);
        return () => document.removeEventListener('fullscreenchange', onChange);
    }, []);
    const toggleFill = () => { void (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => undefined); };

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

    // A session can be reopened at the calling scene from its five ids (?five=a,b,c,d,e&at=lat,lon), which is how
    // the figures of the paper are reproduced. The ids are those the game itself hands out.
    useEffect(() => {
        const query = new URLSearchParams(window.location.search);
        const ids = (query.get('five') ?? '').split(',').filter(Boolean);
        if (ids.length !== TEAM) return;
        void run(async alive => {
            const cards = await Promise.all(ids.map(id => post<{ card: Card }>({ action: 'meet', id })));
            const res = await post<{ lights: Light[] }>({ action: 'summon', chosen: ids });
            if (!alive()) return;
            const five = cards.map(c => c.card);
            track('replay');
            const [lat, lon] = (query.get('at') ?? '').split(',').map(Number);
            setPin(Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : { lat: five[0].lat, lon: five[0].lon });
            setChosen(five);
            setLights(res.lights);
            setCalled([]);
            setScreen(8);
        });
    }, [run, track]);

    const chooseRegion = (key: RegionKey) => { if (!study.current.t0) study.current.t0 = Date.now(); setRegion(key); setPin(null); setScreen(2); };

    const findBuddies = () => {
        if (!region || !pin) return;
        void run(async alive => {
            const query = new URLSearchParams({ region, lat: String(pin.lat), lon: String(pin.lon) });
            const res = await api<{ buddies: Card[] }>(`${API}?${query}`);
            if (!alive()) return;
            setBuddies(res.buddies);
            track('starters_offered', res.buddies.map(card => card.id));
            setScreen(3);
        });
    };

    const pickBuddy = (card: Card) => {
        if (!region) return;
        void run(async alive => {
            track('invite', [card.id]);
            const res = await post<{ mists: Mist[] }>({ action: 'mists', region, chosen: [card.id], shown: [] });
            if (!alive()) return;
            setChosen([card]);
            study.current.peeks = []; study.current.round = new Set();
            setMists(res.mists);
            track('mists_offered', res.mists.map(m => m.id));
            setSelected(null); setPeeked([]);
            setScreen(4);
        });
    };

    const meet = (id: string) => {
        void run(async alive => {
            track('invite', [id]);
            const res = await post<{ card: Card }>({ action: 'meet', id });
            if (!alive()) return;
            setMet(res.card);
            track('revealed', [res.card.id]);
            study.current.peeks.push(study.current.round.size);
            study.current.round = new Set();
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
            track('mists_offered', res.mists.map(m => m.id));
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

    const finish = (seen: ScrollLog) => {
        track('finish');
        const mean = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 1000) / 1000 : null);
        onFinish?.({
            trace: timeline.current,
            region, seconds: Math.round((Date.now() - study.current.t0) / 1000), peeks: study.current.peeks, chosen: chosen.map(c => c.id),
            friends: tally(lights), nearAll: mean(lights.map(l => l.near)), nearAloud: mean(lights.filter(l => l.tease).map(l => l.near)),
            offeredEchoIds: lights.filter(l => l.tease).map(l => l.id),
            skippedCall: study.current.skippedCall, skippedParade: study.current.skippedParade, ...seen,
        });
    };

    const restart = () => {
        study.current = { t0: 0, round: new Set(), peeks: [], skippedCall: false, skippedParade: false };
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
    const onFigure = useCallback((index: number) => {
        if (!chosen[index] || called.includes(index)) return;
        track('caller', [chosen[index].id]);
        setCalled(done => done.includes(index) ? done : [...done, index]);
    }, [chosen, called, track]);
    const onMist = useCallback((id: string) => {
        if (busyRef.current) return;
        track('peek', [id]);
        setSelected(id);
        study.current.round.add(id);
        setPeeked(open => (open.includes(id) ? open : [...open, id]));
        setScreen(s => (s === 4 || s === 5 ? 5 : s));
    }, [track]);

    // Memoised: the map rebuilds its parade plan whenever this array's identity changes.
    const figures = useMemo(() => (met ? [...chosen, met] : chosen), [chosen, met]);
    const selectedMist = mists.find(m => m.id === selected) ?? null;
    const lit = screen >= 8;

    // While calling: the last caller and the sentence of its own record that a twin answers, or, when no twin
    // answers, its one line and the news that no other telling was found (not that there is none).
    const lastCalled = called.length ? called[called.length - 1] : -1;
    const answered = lights.find(l => l.caller === lastCalled && l.callerLine);
    const callLine = lastCalled < 0 || !chosen[lastCalled] ? '下の5体をタップして、同じ話をもつ仲間をよぶ'
        : answered ? `${chosen[lastCalled].name}「${answered.callerLine}」`
        : `${chosen[lastCalled].name}「${chosen[lastCalled].tease}」 ― 同じ話は、ほかに見つかりませんでした`;

    const mapProps: HyakkiMapProps = {
        view: screen <= 1 || lit ? 'japan' : (region ?? 'japan'),
        still: reduced,
        figures,
    };
    if (screen === 1) mapProps.onRegion = chooseRegion;
    if (screen === 2) mapProps.onPick = point => { track('pin_pick'); setPin(point); };
    if (recording) mapProps.onTrace = track;
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
                {screen > 0 && (exhibit
                    ? <a href={exhibit.back.href} className={styles.back}>{exhibit.back.label}</a>
                    : <Link href="/map" className={styles.back}>← 地図</Link>)}
                {canFill && (
                    <button type="button" className={styles.fill} onClick={toggleFill} aria-label={filled ? '全画面をやめる' : '全画面にする'} title={filled ? '全画面をやめる' : '全画面にする'}>
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                            {filled
                                ? <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
                                : <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />}
                        </svg>
                    </button>
                )}

                {screen === 0 && (
                    <button type="button" className={`${styles.intro} ${styles.introFall}`} onClick={() => setScreen(1)} aria-label="はじめる">
                        <span className={styles.title}><ruby>百鬼夜行<rt>ひゃっきやぎょう</rt></ruby></span>
                        <span className={styles.introSub}>百鬼夜行を、あなたの町によぼう</span>
                    </button>
                )}

                {screen > 0 && (
                    <div className={`${styles.panel} ${screen === 10 ? styles.sheet : ''} ${screen === 5 || screen === 3 ? styles.bare : ''} ${screen === 3 ? styles.picks : ''} ${screen === 6 ? styles.reveal : ''}`} ref={panelRef} tabIndex={-1} aria-live="polite">
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
                                    {exhibit?.mapGuide && <p className={styles.mapGuide}>
                                        <span className={styles.mouseGuide}>ドラッグで地図を移動。ホイールで拡大・縮小できます。</span>
                                        <span className={styles.touchGuide}>指1本でスワイプすると地図が動きます。指2本を広げると拡大できます。</span>
                                    </p>}
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
                                                    <button key={id} type="button" className={styles.peek} aria-pressed={id === selected} aria-label={`${i + 1}つ目ののぞいたもや`} onClick={() => { track('peek_again', [id]); setSelected(id); }}>
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
                                <h1 className={styles.scroll}>
                                    <img src={met.picture} alt="" className={styles.metPicture} />
                                    <strong className={styles.metName}>{met.name}</strong>
                                    <span className={styles.joined}>が仲間になった</span>
                                </h1>
                                <p className={styles.metWhere}>{placeText(met)}{met.recordName !== met.name && ` ・ 記録の名前: ${met.recordName}`}</p>
                                <p className={styles.desc}>{met.desc}</p>
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
                                    <h1 className={styles.head}>{callLine}</h1>
                                </div>
                                <div className={styles.actions}>
                                    <button type="button" className={styles.ghost} onClick={() => { track('skip_call'); study.current.skippedCall = true; setCalled([0, 1, 2, 3, 4]); setScreen(9); }}>とばす</button>
                                </div>
                            </div>
                        )}

                        {screen === 9 && (
                            <div className={styles.strip}>
                                <div className={styles.msg}>
                                    <h1 className={styles.head}>あなたの町へ</h1>
                                </div>
                                <div className={styles.actions}>
                                    <button type="button" className={styles.ghost} onClick={() => { track('skip_parade'); study.current.skippedParade = true; setScreen(10); }}>とばす</button>
                                </div>
                            </div>
                        )}

                        {screen === 10 && <Results chosen={chosen} lights={lights} onRestart={restart} onFinish={onFinish && finish} finishLabel={exhibit?.finishLabel} track={recording ? track : undefined} />}
                    </div>
                )}
            </div>

            {screen > 0 && <Queue chosen={chosen} lights={lights} lit={lit} called={called} onCall={screen === 8 ? onFigure : undefined} />}
        </main>
    );
}

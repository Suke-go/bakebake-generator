'use client';
// Story race: reach a target story by moving between similar stories, passing through the
// puzzle's detour prefectures first, then look back at the route on the map. Levels come from
// scripts/archive-race/build_levels.py and open one by one; links and the look-back come from
// /api/archive-race. Distance travelled is a score shown next to the guide's, not a limit.
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { offerFrom } from '@/lib/archive-race';
import { PlayLogger } from '@/lib/play-log';
import type { RaceCard, RaceOverlay, RaceStop } from './YokaiCityView';
import styles from './YokaiRace.module.css';

type Story = { node: number; recordId: string; key: string; prefecture: string; coordinates: [number, number]; landscape: string[] };
type Link = Story & { shared: string[]; hint: string; sharedLandscape: string[]; near?: boolean; fill?: boolean; closer?: boolean };
/** remaining: fewest moves left from this story (server); closer marks the links that lower it. */
type Entry = { here: Story; remaining: number | null; links: Link[]; fill?: Link[] };
type Hop = { from: Story; to: Story; back: boolean; near?: boolean; shared: string[]; hint: string; sharedLandscape: string[]; km: number; prefectureChanged: boolean };
type Detour = { prefecture: string; coordinates: [number, number] };
type Puzzle = { id: string; guideMoves: number; guideKm: number; shortest: number; detours: Detour[]; start: Story; target: Story };
type Level = { level: number; title: string; detours: number; guideMoves: [number, number]; puzzles: Puzzle[] };
type LevelData = { offeredCards: number; maxSteps: number; levels: Level[] };
type Review = { puzzleId: string; reached: boolean; shortest: number; guideMoves: number; detours: (Detour & { visited: boolean })[]; km: number; guideKm: number; mine: Hop[]; shortestRoute: Hop[]; guideRoute: Hop[] };
type Feature = { geometry: { coordinates: number[] }; properties: { id: string | null; name: string | null; summary?: string | null } };
type RouteName = 'mine' | 'shortest' | 'guide';
type Best = { moves: number; km: number };

const LETTERS = 'ABCDEFGHIJ';
const UNLOCK_AFTER = 2;          // puzzles to clear in a level before the next one opens
const PROGRESS_KEY = 'archive-race-progress-v4';   // v4: levels-v5 drew new puzzles under the same ids
const CONSENT_KEY = 'archive-race-log-consent';
const short = (name: string | null | undefined) => (name || '').split(/[；;，,、]/)[0].replace(/[（(].*?[)）]/g, '').trim();

/** Same as the server's: straight line between the two story places, whole km. */
function km(a: Story, b: Story): number {
    const [lng1, lat1] = a.coordinates.map(x => x * Math.PI / 180), [lng2, lat2] = b.coordinates.map(x => x * Math.PI / 180);
    const h = Math.sin((lat2 - lat1) / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin((lng2 - lng1) / 2) ** 2;
    return Math.round(2 * 6371 * Math.asin(Math.sqrt(h)));
}

/** The sentence of a story that holds the shared words, split around them so they can be marked. */
function hintSentence(summary: string, hint: string): [string, string, string] | null {
    if (!hint) return null;
    const text = summary.normalize('NFKC');
    const at = text.indexOf(hint);
    if (at < 0) return null;
    const ends = /[。！？!?]/g;
    let start = 0, end = text.length, m: RegExpExecArray | null;
    while ((m = ends.exec(text))) {
        if (m.index < at) start = m.index + 1;
        else { end = m.index + 1; break; }
    }
    // Long sentences are cut to a window around the words.
    const from = Math.max(start, at - 40), to = Math.min(end, at + hint.length + 50);
    return [(from > start ? '…' : '') + text.slice(from, at).trimStart(), hint, text.slice(at + hint.length, to) + (to < end ? '…' : '')];
}

function readProgress(): Record<string, Best> {
    try { return JSON.parse(localStorage.getItem(PROGRESS_KEY) || '{}') as Record<string, Best>; } catch { return {}; }
}
function writeProgress(progress: Record<string, Best>) {
    try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress)); } catch { /* progress stays for this visit only */ }
}

export default function YokaiRace({ records, mapPick, onVisit, onCloseStory, onTrail, onOverlay, onExit, logging = true, exitLabel = '地図に戻る' }: {
    /** false where nothing can be recorded (the static archive edition): no consent box, no logger. */
    logging?: boolean;
    exitLabel?: string;
    records: Feature[];
    mapPick: { id: string; serial: number } | null;
    onVisit: (recordId: string) => void;
    onCloseStory: () => void;
    onTrail: (stops: RaceStop[], fit: boolean) => void;
    onOverlay: (overlay: RaceOverlay | null) => void;
    onExit: () => void;
}) {
    const byId = useMemo(() => new Map(records.map(r => [String(r.properties.id), r])), [records]);
    const nameOf = useCallback((s: Story) => {
        const record = byId.get(s.recordId)?.properties;
        const opening = (record?.summary || '').normalize('NFKC').slice(0, 14);
        return short(record?.name) || (opening ? `「${opening}…」` : s.key || '名のない話');
    }, [byId]);
    const summaryOf = (s: Story) => byId.get(s.recordId)?.properties.summary || '';
    const stop = useCallback((s: Story): RaceStop => ({ id: s.recordId, name: nameOf(s), coordinates: s.coordinates }), [nameOf]);

    const [data, setData] = useState<LevelData | null>(null), [error, setError] = useState('');
    const [progress, setProgress] = useState<Record<string, Best>>({});
    useEffect(() => { setProgress(readProgress()); }, []);
    useEffect(() => {
        const controller = new AbortController();
        fetch('/api/archive-race', { signal: controller.signal }).then(r => r.ok ? r.json() : Promise.reject()).then(setData)
            .catch(() => { if (!controller.signal.aborted) setError('ゲームのデータを読み込めませんでした。'); });
        return () => controller.abort();
    }, []);
    const cleared = (level: Level) => level.puzzles.filter(p => progress[p.id] !== undefined).length;
    const unlocked = (level: Level) => level.level === 1 || (data ? cleared(data.levels[level.level - 2]) >= UNLOCK_AFTER : false);

    // Opt-in play log: story ids, ranks, timings, distance and reflection choices only.
    // Remembered in this browser, so a reload does not silently stop recording.
    const [consent, setConsentState] = useState(false);
    useEffect(() => { try { setConsentState(localStorage.getItem(CONSENT_KEY) === 'yes'); } catch { /* storage blocked */ } }, []);
    const setConsent = (on: boolean) => { setConsentState(on); try { localStorage.setItem(CONSENT_KEY, on ? 'yes' : 'no'); } catch { /* storage blocked */ } };
    const logger = useRef<PlayLogger | null>(null), lastStep = useRef(0);
    const play = (type: string, payload: Record<string, unknown>) => logger.current?.log(type, payload);
    const dwell = () => { const now = logger.current?.now() ?? 0; const ms = Math.max(0, Math.round(now - lastStep.current)); lastStep.current = now; return ms; };

    const [puzzle, setPuzzle] = useState<Puzzle | null>(null), [levelNo, setLevelNo] = useState(1);
    const [stack, setStack] = useState<number[]>([]), [route, setRoute] = useState<number[]>([]), [backs, setBacks] = useState(0);
    const [travelled, setTravelled] = useState(0), [seenPrefs, setSeenPrefs] = useState<Set<string>>(new Set());
    // Keyed by story and detours done: the moves left depend on both.
    const [cache, setCache] = useState<Map<string, Entry>>(new Map());
    const [review, setReview] = useState<Review | null>(null), [shownRoute, setShownRoute] = useState<RouteName>('mine');
    const [keyMove, setKeyMove] = useState<number | null>(null), [landscapeUse, setLandscapeUse] = useState(''), [reflected, setReflected] = useState(false);
    // Arrived: the target is in the route but the look-back has not loaded yet. No new choices then.
    const arrived = Boolean(puzzle && route[route.length - 1] === puzzle.target.node);
    const playing = Boolean(puzzle && !review && !arrived);
    const here = stack[stack.length - 1];
    const done = useMemo(() => (puzzle?.detours ?? []).reduce((bits, d, k) => seenPrefs.has(d.prefecture) ? bits | (1 << k) : bits, 0), [puzzle, seenPrefs]);
    const hereKey = here === undefined ? '' : `${here}:${done}`;
    const current = here === undefined ? undefined : cache.get(hereKey);
    const storyOf = useMemo(() => new Map([...cache.values()].map(e => [e.here.node, e.here])), [cache]);
    const visited = useMemo(() => new Set(route), [route]);
    const detoursLeft = useMemo(() => (puzzle?.detours ?? []).filter(d => !seenPrefs.has(d.prefecture)).map(d => d.prefecture), [puzzle, seenPrefs]);
    const locked = (o: Link) => Boolean(puzzle && o.node === puzzle.target.node && detoursLeft.length);

    useEffect(() => {
        if (here === undefined || !puzzle || cache.has(hereKey)) return;
        const controller = new AbortController();
        fetch(`/api/archive-race?node=${here}&puzzle=${encodeURIComponent(puzzle.id)}&done=${done}`, { signal: controller.signal }).then(r => r.ok ? r.json() : Promise.reject())
            .then(d => setCache(c => new Map(c).set(hereKey, d))).catch(() => { if (!controller.signal.aborted) setError('つながる話を読み込めませんでした。'); });
        return () => controller.abort();
    }, [here, hereKey, done, cache, puzzle]);

    const offered = useMemo(() => {
        if (!current || !data) return [];
        const linked = current.links.filter(l => !l.near), fill = current.fill ?? [];
        const byNode = new Map([...fill, ...linked].map(l => [l.node, l]));
        // Too few names among the links (a run of ケンムン): further similar stories fill in.
        const cards = offerFrom(linked.map(l => l.node), current.here.key, j => byNode.get(j)?.key ?? '', visited, data.offeredCards, fill.map(l => l.node)).map(j => byNode.get(j)!);
        // The target seen nearby joins as an extra card; the six regular cards stay as they are.
        const near = current.links.find(l => l.near);
        const withNear = near && !cards.some(c => c.node === near.node) ? [...cards, near] : cards;
        // At least one card lowers the moves left: the most similar such link (then filler) takes the last regular place.
        // A name already on the other cards is passed over when another closer story exists.
        const closers = [...linked, ...fill].filter(l => l.closer && !visited.has(l.node));
        const kept = new Set(cards.slice(0, -1).map(c => c.key).filter(Boolean));
        const toward = closers.find(l => !l.key || !kept.has(l.key)) ?? closers[0];
        if (toward && !withNear.some(c => c.closer)) withNear.splice(Math.max(0, cards.length - 1), cards.length ? 1 : 0, toward);
        return withNear;
    }, [current, data, visited]);

    // The choice set matters as much as the pick: log it each time it changes.
    const shownKey = useRef('');
    useEffect(() => {
        if (!playing || !current || !offered.length) return;
        const key = `${current.here.node}:${offered.map(o => o.node).join(',')}`;
        if (key === shownKey.current) return;
        shownKey.current = key;
        play('choices_shown', { fromId: current.here.recordId, remaining: current.remaining, items: offered.map(o => ({ id: o.recordId, relation: 'semantic' })) });
    }, [playing, current, offered]);

    const cardOf = useCallback((o: Link): RaceCard => {
        const isTarget = Boolean(puzzle && o.node === puzzle.target.node), wait = isTarget && detoursLeft.length > 0;
        const summary = byId.get(o.recordId)?.properties.summary || '';
        const sentence = hintSentence(summary, o.hint);
        return {
            place: o.prefecture, km: current ? km(current.here, o) : 0, detour: detoursLeft.includes(o.prefecture), target: isTarget, locked: wait,
            note: isTarget ? (wait ? `目的の話です。先に寄り道（${detoursLeft.join('・')}）へ` : o.near ? '目的の話がすぐ近くに見えます' : '目的の話です') : undefined,
            ...(sentence ? { before: sentence[0], word: sentence[1], after: sentence[2] } : { excerpt: summary.slice(0, 80) }),
            landscape: o.sharedLandscape.length ? `どちらも${o.sharedLandscape.join('・')}` : undefined,
        };
    }, [puzzle, detoursLeft, byId, current]);

    const detourPins = useCallback((done: (d: Detour) => boolean) => (puzzle?.detours ?? []).map(d => ({ name: d.prefecture, coordinates: d.coordinates, done: done(d) })), [puzzle]);

    // Map overlay and trail follow the game state.
    useEffect(() => {
        if (review || arrived) return;
        if (!puzzle || !current) { onOverlay(null); return; }
        onOverlay({ candidates: offered.map((o, i) => ({ ...stop(o), label: LETTERS[i], card: cardOf(o) })), target: stop(puzzle.target), here: stop(current.here),
            detours: detourPins(d => seenPrefs.has(d.prefecture)), fit: true });
    }, [puzzle, current, offered, review, arrived, onOverlay, stop, detourPins, seenPrefs, cardOf]);
    useEffect(() => {
        if (review || !puzzle) return;
        onTrail(stack.map(n => storyOf.get(n)).filter((s): s is Story => Boolean(s)).map(stop), false);
    }, [stack, storyOf, puzzle, review, onTrail, stop]);
    useEffect(() => () => { onOverlay(null); onTrail([], false); }, [onOverlay, onTrail]);

    const lastRemaining = useRef<number | null>(null);
    const [trend, setTrend] = useState<{ left: number; delta: number | null } | null>(null);
    useEffect(() => {
        if (!current || !puzzle) return;
        const left = current.remaining;
        setTrend(left === null ? null : { left, delta: lastRemaining.current === null ? null : left - lastRemaining.current });
        lastRemaining.current = left;
    }, [current, puzzle]);

    const ended = useRef(true);
    function start(level: Level, chosen?: Puzzle) {
        // The next uncleared puzzle after the one just played, so giving up moves on instead of repeating.
        const from = puzzle && puzzle.id.startsWith(`L${level.level}-`) ? level.puzzles.findIndex(p => p.id === puzzle.id) + 1 : 0;
        const order = [...level.puzzles.slice(from), ...level.puzzles.slice(0, from)];
        const next = chosen ?? order.find(p => progress[p.id] === undefined && p.id !== puzzle?.id) ?? order[0];
        if (logging && consent && !logger.current) { logger.current = PlayLogger.start('race'); play('play_started', { mode: 'race', entry: 'puzzle', corpusVersion: 'archive-race-levels-v5' }); }
        lastStep.current = logger.current?.now() ?? 0;
        play('race_started', { puzzleId: next.id, level: level.level, startId: next.start.recordId, targetId: next.target.recordId });
        ended.current = false;
        setCache(new Map());   // a near target depends on the puzzle
        lastRemaining.current = null; setTrend(null);
        setLevelNo(level.level); setPuzzle(next); setStack([next.start.node]); setRoute([next.start.node]); setBacks(0);
        setTravelled(0); setSeenPrefs(new Set([next.start.prefecture]));
        setReview(null); setShownRoute('mine'); setKeyMove(null); setLandscapeUse(''); setReflected(false); setError('');
        onCloseStory();
    }

    async function finish(reason: 'reached' | 'gave_up', finalRoute: number[], finalKm: number) {
        if (!puzzle) return;
        if (!ended.current) {
            ended.current = true;
            const ids = finalRoute.map(n => (n === puzzle.target.node ? puzzle.target : storyOf.get(n))?.recordId).filter((x): x is string => Boolean(x));
            play('race_ended', { puzzleId: puzzle.id, reason, moves: finalRoute.length - 1, backs, km: finalKm, path: ids.slice(-500) });
            void logger.current?.flush();   // a finished puzzle should not wait for the next timer tick
        }
        if (reason === 'reached') {
            const moves = finalRoute.length - 1, before = readProgress()[puzzle.id];
            const next = { ...readProgress(), [puzzle.id]: { moves: Math.min(moves, before?.moves ?? Infinity), km: Math.min(finalKm, before?.km ?? Infinity) } };
            writeProgress(next); setProgress(next);
        }
        try {
            const response = await fetch('/api/archive-race', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ puzzleId: puzzle.id, route: finalRoute }) });
            if (!response.ok) throw new Error();
            const r = await response.json() as Review;
            setReview(r); showRoute(r, 'mine');
        } catch { setError('振り返りを作れませんでした。'); }
    }

    function move(link: Link, via: 'card' | 'map', rank: number) {
        if (!puzzle || !current || locked(link)) return;
        play('hop', { fromId: current.here.recordId, toId: link.recordId, via, rank, relation: 'semantic', dwellMs: dwell(), revisit: false });
        const nextRoute = [...route, link.node], nextKm = travelled + km(current.here, link);
        setRoute(nextRoute); setTravelled(nextKm); setSeenPrefs(p => new Set(p).add(link.prefecture));
        // On arrival the map frames the whole route instead of flying to the target.
        if (link.node === puzzle.target.node) { void finish('reached', nextRoute, nextKm); return; }
        setStack(s => [...s, link.node]);
    }
    function back() {
        if (stack.length < 2 || !current) return;
        const previous = stack[stack.length - 2];
        const to = storyOf.get(previous);
        if (to) play('hop', { fromId: current.here.recordId, toId: to.recordId, via: 'history', rank: null, dwellMs: dwell(), revisit: true });
        setStack(s => s.slice(0, -1)); setRoute(r => [...r, previous]); setBacks(b => b + 1);
        if (to) setTravelled(t => t + km(current.here, to));
    }
    useEffect(() => {
        if (!mapPick || !playing) return;
        const i = offered.findIndex(o => o.recordId === mapPick.id);
        if (i >= 0) move(offered[i], 'map', i);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mapPick]);
    const live = useRef({ puzzleId: '', moves: 0, backs: 0, km: 0 });
    useEffect(() => { live.current = { puzzleId: puzzle?.id ?? '', moves: Math.max(0, route.length - 1), backs, km: travelled }; }, [puzzle, route, backs, travelled]);
    useEffect(() => () => {
        if (logger.current && !ended.current && live.current.puzzleId) play('race_ended', { ...live.current, reason: 'left', path: [] });
        logger.current?.close();
    }, []);

    const routeOf = (r: Review, name: RouteName) => name === 'mine' ? r.mine : name === 'shortest' ? r.shortestRoute : r.guideRoute;
    const stopsOf = (hops: Hop[]) => hops.length ? [stop(hops[0].from), ...hops.map(h => stop(h.to))] : [];
    function showRoute(r: Review, name: RouteName) {
        setShownRoute(name);
        play('review_route_shown', { puzzleId: r.puzzleId, route: name });
        // One camera move framing the player's route, the target and any route compared with it.
        onTrail(stopsOf(r.mine), false);
        onOverlay({ candidates: [], target: puzzle ? stop(puzzle.target) : null, compare: name === 'mine' ? undefined : stopsOf(routeOf(r, name)), frame: stopsOf(r.mine),
            detours: r.detours.map(d => ({ name: d.prefecture, coordinates: d.coordinates, done: d.visited })), fit: true });
    }

    if (error && !data) return <section className={styles.race}><p role="alert">{error}</p><button onClick={onExit}>{exitLabel}</button></section>;
    if (!data) return <section className={styles.race}><p role="status">読み込んでいます…</p></section>;

    const level = data.levels[levelNo - 1];
    const nextLevel = data.levels[levelNo];
    const header = <div className={styles.header}><h2>妖怪アーカイブレース</h2><button onClick={() => { if (playing && !ended.current) play('race_ended', { puzzleId: puzzle!.id, reason: 'left', moves: route.length - 1, backs, km: travelled, path: [] }); ended.current = true; onExit(); }}>{exitLabel}</button></div>;
    const distanceNote = <p className={styles.note}>距離は話が記録された地点どうしの直線距離です。多くの話は都道府県の代表地点に置かれているので、同じ県の中の移動はたいてい0kmになります。</p>;

    if (!puzzle) return <section className={styles.race} aria-label="妖怪アーカイブレース">
        {header}
        <p className={styles.lead}>似ている話を6つの候補から選んでたどり、目的の話にたどり着いてください。段階2からは、途中で寄る県（寄り道）が決まっていて、そこを通ってからでないと目的の話には入れません。移動した距離も記録されるので、案内役より短い旅を目指してみてください。候補は地図上のピン（A〜F）にもなります。着いたら、たどった道を地図で振り返ります。</p>
        <ol className={styles.levels}>{data.levels.map(l => {
            const open = unlocked(l);
            return <li key={l.level}><button disabled={!open} onClick={() => start(l)}>
                <span className={styles.levelNo}>段階{l.level}</span><strong>{l.title}</strong>
                <small>{open ? `${l.detours ? `寄り道${l.detours}つ ・ ` : ''}案内役なら${l.guideMoves[0]}〜${l.guideMoves[1]}手 ・ クリア ${cleared(l)} / ${l.puzzles.length}` : `段階${l.level - 1}を${UNLOCK_AFTER}問クリアすると開きます`}</small>
            </button></li>;
        })}</ol>
        {logging && <label className={styles.consent}><input type="checkbox" checked={consent} disabled={Boolean(logger.current)} onChange={e => setConsent(e.target.checked)} /><span>研究のため、操作（選んだ話、その順番と時間、移動距離、振り返りの選択）を記録してよい。</span></label>}
    </section>;

    const target = <div className={styles.target}>
        <span className={styles.tag}>目的の話</span><strong>{nameOf(puzzle.target)}</strong><span className={styles.place}>{puzzle.target.prefecture}</span>
        <p>{summaryOf(puzzle.target)}</p>
        {puzzle.target.landscape.length > 0 && <small>この話の地勢：{puzzle.target.landscape.join('・')}</small>}
    </div>;
    const detourList = (done: (d: Detour) => boolean) => puzzle.detours.length > 0 && <p className={styles.detours}>寄り道：{puzzle.detours.map((d, i) =>
        <Fragment key={d.prefecture}>{i > 0 && ' ・ '}<span data-done={done(d)}>{done(d) ? '✓ ' : ''}{d.prefecture}</span></Fragment>)}</p>;

    if (review) {
        const hops = routeOf(review, shownRoute);
        const forward = review.mine.map((h, i) => ({ h, i })).filter(x => !x.h.back);
        const farthest = forward.reduce((best, x) => (x.h.km > (best?.h.km ?? -1) ? x : best), forward[0]);
        const prefectures = new Set(review.mine.flatMap(h => [h.from.prefecture, h.to.prefecture])).size;
        const landscapeShare = forward.length ? Math.round(100 * forward.filter(x => x.h.sharedLandscape.length).length / forward.length) : 0;
        const nowOpen = nextLevel && cleared(level) >= UNLOCK_AFTER;
        const marks = [['到着', review.reached], ['案内役の手数以内', review.reached && review.mine.length <= review.guideMoves], ['案内役の距離以内', review.reached && review.km <= review.guideKm]] as const;
        return <section className={styles.race} aria-label="妖怪アーカイブレースの振り返り">
            {header}
            <h3 className={styles.result}>{review.reached ? `${review.mine.length}手・${review.km.toLocaleString()}kmで到着` : '途中で振り返り'}</h3>
            <p className={styles.marks}>{marks.map(([label, ok]) => <span key={label} data-ok={ok}>{ok ? '★' : '☆'} {label}</span>)}</p>
            <p className={styles.compare}>案内役 {review.guideMoves}手・{review.guideKm.toLocaleString()}km ・ 最短 {review.shortest}手</p>
            {detourList(d => review.detours.find(x => x.prefecture === d.prefecture)?.visited ?? false)}
            <p className={styles.stats}>{prefectures}都道府県をめぐりました。一番遠い跳躍は{farthest ? `${nameOf(farthest.h.from)}（${farthest.h.from.prefecture}）→ ${nameOf(farthest.h.to)}（${farthest.h.to.prefecture}）の${farthest.h.km.toLocaleString()}km` : 'ありません'}。地勢が同じ話へ進んだ手は{landscapeShare}%。</p>
            {distanceNote}
            {target}
            <nav className={styles.routeTabs} aria-label="地図に重ねる道">{(['mine', 'shortest', 'guide'] as const).map(name =>
                <button key={name} aria-pressed={shownRoute === name} onClick={() => showRoute(review, name)}>{name === 'mine' ? 'あなたの道' : name === 'shortest' ? '最短の道' : '案内役の道'}</button>)}</nav>
            <p className={styles.routeNote}>{shownRoute === 'mine' ? '金色の線があなたの道です。' : '金色があなたの道、青い点線が比べる道です。'}</p>
            <ol className={styles.hops}>{hops.map((h, i) => <li key={i} className={h.back ? styles.backHop : undefined} data-farthest={shownRoute === 'mine' && farthest?.i === i}>
                <button onClick={() => onVisit(h.to.recordId)}>
                    <span className={styles.hopNames}>{nameOf(h.from)}（{h.from.prefecture}）→ {nameOf(h.to)}（{h.to.prefecture}）</span>
                    <span className={styles.hopMeta}>{h.back ? `戻る ・ ${h.km.toLocaleString()}km` : `${h.km.toLocaleString()}km${h.prefectureChanged ? '・県をまたぐ' : ''}${h.near ? '・近くに見えた目的の話へ' : ''}`}{h.shared.length > 0 && ` ・ 共通：${h.shared.join('、')}`}{h.sharedLandscape.length > 0 && ` ・ どちらも${h.sharedLandscape.join('・')}`}</span>
                </button>
            </li>)}</ol>
            {logging && (!reflected ? <form className={styles.reflect} onSubmit={e => { e.preventDefault(); play('race_reflection', { puzzleId: review.puzzleId, keyMove, landscape: landscapeUse }); setReflected(true); }}>
                <fieldset><legend>決め手になった一手は？</legend>
                    <select value={keyMove ?? ''} onChange={e => setKeyMove(e.target.value === '' ? null : Number(e.target.value))}>
                        <option value="">わからない</option>
                        {forward.map(({ h, i }) => <option key={i} value={i}>{i + 1}手目：{nameOf(h.to)}（{h.to.prefecture}）</option>)}
                    </select></fieldset>
                <fieldset><legend>山・水辺・海辺などの地勢は、選ぶときに</legend>
                    {([['used', '手がかりにした'], ['noticed', 'あとで気づいた'], ['not', '意識しなかった']] as const).map(([v, label]) =>
                        <label key={v}><input type="radio" name="landscape" checked={landscapeUse === v} onChange={() => setLandscapeUse(v)} />{label}</label>)}
                </fieldset>
                <button type="submit" disabled={!landscapeUse}>振り返りを残す</button>
            </form> : <p className={styles.thanks}>振り返りを残しました。</p>)}
            <div className={styles.next}>
                <button onClick={() => start(level)}>段階{level.level}の次の問題</button>
                {nextLevel && <button disabled={!nowOpen} onClick={() => start(nextLevel)}>{nowOpen ? `段階${nextLevel.level}へ進む` : `段階${nextLevel.level}はあと${UNLOCK_AFTER - cleared(level)}問`}</button>}
                <button onClick={() => { setPuzzle(null); setReview(null); onOverlay(null); onTrail([], false); }}>段階を選ぶ</button>
            </div>
            {error && <p role="alert">{error}</p>}
        </section>;
    }

    return <section className={styles.race} aria-label="妖怪アーカイブレース">
        {header}
        <p className={styles.status}>段階{levelNo}「{level.title}」・ {route.length - 1}手目 ・ 移動 {travelled.toLocaleString()}km ・ 案内役なら{puzzle.guideMoves}手・{puzzle.guideKm.toLocaleString()}km{logging && <> ・ <span className={styles.logState} data-on={Boolean(logger.current)}>{logger.current ? '記録中' : '記録していません'}</span></>}</p>
        {trend && <p className={styles.trend} data-delta={trend.delta === null ? 'start' : Math.sign(trend.delta)} aria-live="polite">
            目的まで最短であと<strong>{trend.left}</strong>手
            {trend.delta !== null && <span>{trend.delta < 0 ? '近づいた' : trend.delta > 0 ? '離れた' : '変わらず'}</span>}</p>}
        {detourList(d => seenPrefs.has(d.prefecture))}
        {target}
        {current && <div className={styles.here}><span className={styles.tag}>いまの話</span><strong>{nameOf(current.here)}</strong><span className={styles.place}>{current.here.prefecture}</span>
            <p>{summaryOf(current.here)}</p></div>}
        <h3 className={styles.choose}>次に読む話（地図上のカードを押して進みます）</h3>
        {!current && <p role="status">つながる話を読み込んでいます…</p>}
        <div className={styles.cards}>{offered.map((o, i) => {
            const card = cardOf(o);
            return <button key={o.node} className={`${styles.card} ${styles.compact}`} data-target={card.target} disabled={card.locked} onClick={() => move(o, 'card', i)}>
                <span className={styles.letter}>{LETTERS[i]}</span>
                <span className={styles.cardHead}><strong>{nameOf(o)}</strong><span className={styles.place}>{o.prefecture}</span>
                    <span className={styles.hopKm}>+{card.km.toLocaleString()}km</span>
                    {card.detour && <span className={styles.detourTag}>寄り道の県</span>}</span>
                {card.note && <span className={styles.found}>{card.note}</span>}
            </button>;
        })}</div>
        {current && !offered.length && <p>この話から先の未読の話はありません。戻ってください。</p>}
        <div className={styles.controls}>
            <button disabled={stack.length < 2} onClick={back}>← 戻る（1手）</button>
            <button onClick={() => void finish('gave_up', route, travelled)}>あきらめて振り返る</button>
        </div>
        {distanceNote}
        {error && <p role="alert">{error}</p>}
    </section>;
}

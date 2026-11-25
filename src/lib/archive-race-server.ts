// Server side of the story race: serves one story's links at a time and builds
// the look-back after a puzzle. Data: data/archive-race/race-runtime.json
// (export_race_runtime.py) and levels.json (build_levels.py).
import { readFile } from 'node:fs/promises';
import path from 'node:path';

type RuntimeNode = [recordId: string, key: string, prefecture: string, lat: number, lng: number, landscape: number];
type Runtime = { version: string; graph: string; landscape: string[]; nodes: RuntimeNode[]; edges: number[][]; facets: string[][][]; hints: string[][]; fill?: number[][] };
export type RaceDetour = { prefecture: string; coordinates: [number, number] };
type LevelPuzzle = { id: string; level: number; startNode: number; targetNode: number; start: string; target: string; detours: RaceDetour[]; shortest: number; guideMoves: number; guideKm: number; optimalPath: number[]; guidePath: number[]; nearTarget: number[] };
type Levels = { version: string; graph: string; offeredCards: number; maxSteps: number; levels: { level: number; title: string; detours: number; guideMoves: [number, number]; puzzles: LevelPuzzle[] }[] };

export const LANDSCAPE_LABELS: Record<string, string> = { mountain: '山', water: '水辺', coast: '海辺', agrarian: '里・田畑', boundary: '境・峠' };
const DIR = path.join(process.cwd(), 'data', 'archive-race');

let loaded: Promise<{ runtime: Runtime; levels: Levels; puzzles: Map<string, LevelPuzzle>; near: Map<string, Set<number>> }> | null = null;
function load() {
    loaded ??= (async () => {
        const [runtime, levels] = await Promise.all([
            readFile(path.join(DIR, 'race-runtime.json'), 'utf8').then(JSON.parse) as Promise<Runtime>,
            readFile(path.join(DIR, 'levels.json'), 'utf8').then(JSON.parse) as Promise<Levels>,
        ]);
        if (runtime.graph !== levels.graph) throw new Error('race-runtime.json and levels.json were built from different graphs');
        const puzzles = new Map(levels.levels.flatMap(l => l.puzzles.map(p => [p.id, p] as const)));
        const near = new Map([...puzzles].map(([id, p]) => [id, new Set(p.nearTarget ?? [])] as const));
        return { runtime, levels, puzzles, near };
    })().catch(error => { loaded = null; throw error; });
    return loaded;
}

export type RaceStory = { node: number; recordId: string; key: string; prefecture: string; coordinates: [number, number]; landscape: string[] };
/** near: not a link, but the puzzle's target seen from a story it is among the 50 nearest of (build_levels.py).
 *  fill: not a link, a further similar story used when the links hold too few names (offerFrom). */
/** hint: the words in the linked story's text that carry the shared word, as written there (export_race_runtime.py). */
export type RaceLink = RaceStory & { shared: string[]; hint: string; sharedLandscape: string[]; near?: boolean; fill?: boolean; closer?: boolean };
export type RaceHop = { from: RaceStory; to: RaceStory; back: boolean; near?: boolean; shared: string[]; hint: string; sharedLandscape: string[]; km: number; prefectureChanged: boolean };

function story(rt: Runtime, i: number): RaceStory {
    const [recordId, key, prefecture, lat, lng, bits] = rt.nodes[i];
    return { node: i, recordId, key, prefecture, coordinates: [lng, lat], landscape: rt.landscape.filter((_, k) => bits & (1 << k)).map(c => LANDSCAPE_LABELS[c] ?? c) };
}

function km(a: RaceStory, b: RaceStory): number {
    const [lng1, lat1] = a.coordinates.map(x => x * Math.PI / 180), [lng2, lat2] = b.coordinates.map(x => x * Math.PI / 180);
    const h = Math.sin((lat2 - lat1) / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin((lng2 - lng1) / 2) ** 2;
    return Math.round(2 * 6371 * Math.asin(Math.sqrt(h)));
}

function link(rt: Runtime, from: number, to: number): { shared: string[]; hint: string; sharedLandscape: string[] } {
    const k = rt.edges[from].indexOf(to);
    const a = story(rt, from), b = story(rt, to);
    return { shared: k >= 0 ? rt.facets[from][k] ?? [] : [], hint: k >= 0 ? rt.hints?.[from]?.[k] ?? '' : '', sharedLandscape: a.landscape.filter(x => b.landscape.includes(x)) };
}

export async function raceLevels() {
    const { runtime, levels } = await load();
    return {
        version: levels.version, offeredCards: levels.offeredCards, maxSteps: levels.maxSteps,
        levels: levels.levels.map(l => ({
            level: l.level, title: l.title, detours: l.detours ?? 0, guideMoves: l.guideMoves,
            puzzles: l.puzzles.map(p => ({ id: p.id, guideMoves: p.guideMoves, guideKm: p.guideKm, shortest: p.shortest, detours: p.detours ?? [], start: story(runtime, p.startNode), target: story(runtime, p.targetNode) })),
        })),
    };
}

// Moves left to finish a puzzle from each story, for the "closer / farther" line in play.
// State = (story, detour prefectures visited so far, the story's own included). A move may use a
// link, a filler story or, into the target, the near rule: everything a card can offer. Computed
// once per puzzle by a backward breadth-first search from (target, all detours visited).
let incoming: number[][] | null = null;
const remainingTables = new Map<string, { bits: (node: number) => number; dist: Int16Array }>();
function remainingTable(rt: Runtime, puzzle: LevelPuzzle, nearTarget: Set<number>) {
    const cached = remainingTables.get(puzzle.id);
    if (cached) return cached;
    const n = rt.nodes.length;
    if (!incoming) {
        incoming = Array.from({ length: n }, () => [] as number[]);
        for (let u = 0; u < n; u++) for (const v of new Set([...rt.edges[u], ...(rt.fill?.[u] ?? [])])) if (v !== u) incoming[v].push(u);
    }
    const detours = (puzzle.detours ?? []).map(d => d.prefecture);
    const bits = (node: number) => { const k = detours.indexOf(rt.nodes[node][2]); return k < 0 ? 0 : 1 << k; };
    const masks = 1 << detours.length, full = masks - 1;
    const dist = new Int16Array(n * masks).fill(-1);
    const queue = new Int32Array(n * masks);
    let head = 0, tail = 0;
    dist[puzzle.targetNode * masks + full] = 0; queue[tail++] = puzzle.targetNode * masks + full;
    while (head < tail) {
        const state = queue[head++], v = Math.floor(state / masks), m = state % masks, d = dist[state];
        const from = v === puzzle.targetNode ? [...incoming[v], ...nearTarget] : incoming[v];
        for (const u of from) {
            if (u === puzzle.targetNode) continue;   // the target ends the route; it is locked until every detour is visited
            const bu = bits(u);
            for (const m0 of new Set([m, m & ~bits(v)])) {
                if ((m0 | bits(v)) !== m || (m0 & bu) !== bu) continue;
                const s = u * masks + m0;
                if (dist[s] < 0) { dist[s] = d + 1; queue[tail++] = s; }
            }
        }
    }
    const table = { bits, dist };
    remainingTables.set(puzzle.id, table);
    return table;
}

/** done: bit k set when the puzzle's k-th detour prefecture was visited before this story.
 *  remaining: fewest moves left from here with every card a story can offer (null without a puzzle).
 *  closer: the link or filler would bring that number down; the six cards always hold one. */
export async function raceLinks(node: number, puzzleId?: string | null, done = 0): Promise<{ here: RaceStory; remaining: number | null; links: RaceLink[]; fill: RaceLink[] } | null> {
    const { runtime, puzzles, near } = await load();
    if (!Number.isInteger(node) || node < 0 || node >= runtime.nodes.length) return null;
    const links: RaceLink[] = runtime.edges[node].filter(j => j !== node).map(j => ({ ...story(runtime, j), ...link(runtime, node, j) }));
    const puzzle = puzzleId ? puzzles.get(puzzleId) : undefined;
    if (puzzle && near.get(puzzle.id)?.has(node) && !links.some(l => l.node === puzzle.targetNode)) {
        links.push({ ...story(runtime, puzzle.targetNode), ...link(runtime, node, puzzle.targetNode), near: true });
    }
    const fill: RaceLink[] = (runtime.fill?.[node] ?? []).map(j => ({ ...story(runtime, j), ...link(runtime, node, j), fill: true }));
    let remaining: number | null = null;
    if (puzzle) {
        const { bits, dist } = remainingTable(runtime, puzzle, near.get(puzzle.id) ?? new Set());
        const masks = 1 << (puzzle.detours ?? []).length;
        const m = (Number.isInteger(done) && done >= 0 && done < masks ? done : 0) | bits(node);
        const left = (j: number, mask: number) => dist[j * masks + (mask | bits(j))];
        const here = dist[node * masks + m];
        remaining = here < 0 ? null : here;
        if (here > 0) for (const l of [...links, ...fill]) { const d = left(l.node, m); if (d >= 0 && d < here) l.closer = true; }
    }
    return { here: story(runtime, node), remaining, links, fill };
}

function hops(rt: Runtime, route: number[], target: number, nearTarget: Set<number>): RaceHop[] | null {
    const out: RaceHop[] = [];
    for (let i = 1; i < route.length; i++) {
        const u = route[i - 1], v = route[i];
        const linked = Boolean(rt.edges[u]?.includes(v) || rt.fill?.[u]?.includes(v));
        const near = !linked && v === target && nearTarget.has(u);
        const back = !linked && !near && route.slice(0, i - 1).includes(v);
        if (!linked && !near && !back) return null;
        const from = story(rt, u), to = story(rt, v);
        out.push({ from, to, back, ...(near ? { near } : {}), ...(back ? { shared: [], hint: '', sharedLandscape: [] } : link(rt, u, v)), km: km(from, to), prefectureChanged: from.prefecture !== to.prefecture });
    }
    return out;
}

const totalKm = (route: RaceHop[]) => route.reduce((sum, h) => sum + h.km, 0);

/** The look-back for one played route: the player's moves next to the shortest route and the guide's.
 *  The target counts as reached only when every detour prefecture came before it. Km counts every
 *  move, back moves included, as the guide's km does. */
export async function raceReview(puzzleId: string, route: unknown) {
    const { runtime, levels, puzzles, near } = await load();
    const puzzle = puzzles.get(puzzleId);
    if (!puzzle || !Array.isArray(route) || route.length < 1 || route.length > levels.maxSteps * 4 || !route.every(n => Number.isInteger(n) && n >= 0 && n < runtime.nodes.length)) return null;
    if (route[0] !== puzzle.startNode) return null;
    const nearTarget = near.get(puzzle.id) ?? new Set<number>();
    const mine = hops(runtime, route as number[], puzzle.targetNode, nearTarget);
    if (!mine) return null;
    const seen = new Set((route as number[]).slice(0, -1).map(n => runtime.nodes[n][2]));
    const detours = (puzzle.detours ?? []).map(d => ({ ...d, visited: seen.has(d.prefecture) }));
    const guideRoute = hops(runtime, puzzle.guidePath, puzzle.targetNode, nearTarget) ?? [];
    return {
        puzzleId, reached: route[route.length - 1] === puzzle.targetNode && detours.every(d => d.visited), shortest: puzzle.shortest, guideMoves: puzzle.guideMoves,
        detours, km: totalKm(mine), guideKm: totalKm(guideRoute),
        mine, shortestRoute: hops(runtime, puzzle.optimalPath, puzzle.targetNode, nearTarget) ?? [], guideRoute,
    };
}

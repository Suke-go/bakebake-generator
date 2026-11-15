// Pure selection rules for /hyakki: no file access, indices into one `units` array.
// The server (hyakki-server.ts) builds that array, the similarity views and the geography.
import type { Point, RegionKey } from './hyakki-types';

export const REGIONS: readonly RegionKey[] = ['hokkaido-tohoku', 'kanto', 'chubu', 'kinki', 'chugoku-shikoku', 'kyushu-okinawa'];

/** Companion candidates offered on screen 3. */
export const BUDDY_COUNT = 3;
/** Fill-in kinds need at least this many records in the prefecture before the rule is relaxed. */
export const BUDDY_MIN_KIND_RECORDS = 2;

/** Mists on screen 4 and how many of them favour yokai whose town is known. */
export const MIST_TOTAL = 12;
export const MIST_PLACE_QUOTA = 4;
export const MIST_KIND_CAP = 2;
/** After a meeting this many shown mists (the least like the new yokai) fade away. New mists appear to bring the
 *  total back to MIST_TOTAL: MIST_FADE of them, plus one for the mist just met. */
export const MIST_FADE = 4;
/** Which list each new mist is drawn from, in turn: similar lore, similar shape, similar overall, then one dissimilar. */
export const MIST_MIX: readonly string[] = ['lore', 'shape', 'combined', 'far'];

export const CHOSEN_COUNT = 5;
export const PARADE_TOTAL = 100;
export const SUMMON_KIND_CAP = 5;
/** The first lights come in rounds: each chosen yokai in turn calls its own most similar uncalled yokai. */
export const SUMMON_ROUNDS = 5;

/** Weight of each way of looking at similarity; add a view here and in the server to extend it. */
export const VIEW_WEIGHTS: Record<string, number> = { lore: 0.5, shape: 0.5 };

export type Unit = {
    id: string; key: string; kind: string; name: string; prefecture: string; region: RegionKey;
    place: string | null; lat: number; lon: number; records: number;
};

/** score returns null when this view has no data for the pair (e.g. a kind without pictures). */
export type SimilarityView = { name: string; weight: number; score: (a: number, b: number) => number | null };

export function distanceKm(a: Point, b: Point): number {
    const rad = Math.PI / 180;
    const h = Math.sin((b.lat - a.lat) * rad / 2) ** 2
        + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin((b.lon - a.lon) * rad / 2) ** 2;
    return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** 1 for the largest value, 0 for the smallest; ties share the average rank. */
function percentiles(values: readonly (number | null)[]): (number | null)[] {
    const present = values.map((v, i) => [v, i] as const).filter((e): e is readonly [number, number] => e[0] !== null);
    present.sort((x, y) => x[0] - y[0]);
    const out: (number | null)[] = values.map(() => null);
    const m = present.length;
    for (let s = 0; s < m;) {
        let e = s;
        while (e + 1 < m && present[e + 1][0] === present[s][0]) e++;
        const pct = m === 1 ? 1 : (s + e) / 2 / (m - 1);
        for (let k = s; k <= e; k++) out[present[k][1]] = pct;
        s = e + 1;
    }
    return out;
}

/**
 * The one place similarity is computed. Each view is turned into a rank among the candidates
 * (values differ in range between views) and the ranks are blended by weight. Geography is not a view.
 * combined and byView are 0-1, 1 = most like the anchor; byView entries are null where a view has no data.
 */
export function similarityTo(anchor: number, candidates: readonly number[], views: readonly SimilarityView[]):
    { combined: number[]; byView: Record<string, (number | null)[]> } {
    const byView: Record<string, (number | null)[]> = {};
    for (const v of views) byView[v.name] = percentiles(candidates.map(c => v.score(anchor, c)));
    const combined = candidates.map((_, j) => {
        let sum = 0, weight = 0;
        for (const v of views) {
            const pct = byView[v.name][j];
            if (pct !== null) { sum += v.weight * pct; weight += v.weight; }
        }
        return weight > 0 ? sum / weight : 0;
    });
    return { combined, byView };
}

const byKind = (units: readonly Unit[], list: readonly number[]) => {
    const m = new Map<string, number[]>();
    for (const i of list) { const g = m.get(units[i].kind); if (g) g.push(i); else m.set(units[i].kind, [i]); }
    return m;
};
const strongest = (units: readonly Unit[], list: readonly number[]) =>
    [...list].sort((a, b) => units[b].records - units[a].records || units[a].id.localeCompare(units[b].id));

/**
 * Companion candidates: yokai filed under the pin's town first, then the kinds this prefecture
 * is unusually rich in (its share of records / the national share). One yokai per kind, never by distance.
 */
export function selectBuddies(units: readonly Unit[], where: { prefecture: string; municipality: string | null }, region: RegionKey, count = BUDDY_COUNT): number[] {
    const all = units.map((_, i) => i);
    const here = all.filter(i => units[i].prefecture === where.prefecture);
    const picked: number[] = [];
    const kinds = new Set<string>();
    const take = (i: number) => { if (picked.length < count && !kinds.has(units[i].kind)) { picked.push(i); kinds.add(units[i].kind); } };

    if (where.municipality) {
        for (const i of strongest(units, here.filter(j => units[j].place === where.municipality))) take(i);
    }
    if (picked.length < count) {
        const records = (list: readonly number[]) => list.reduce((s, i) => s + units[i].records, 0);
        const nationalTotal = records(all), localTotal = records(here);
        const nationalKind = new Map([...byKind(units, all)].map(([k, l]) => [k, records(l)] as const));
        const ranked = [...byKind(units, here)].map(([kind, list]) => {
            const local = records(list);
            return { kind, local, ratio: (local / localTotal) / ((nationalKind.get(kind) ?? local) / nationalTotal), best: strongest(units, list)[0] };
        }).sort((a, b) => b.ratio - a.ratio || a.kind.localeCompare(b.kind));
        for (const r of ranked.filter(r => r.local >= BUDDY_MIN_KIND_RECORDS)) take(r.best);
        for (const r of ranked) take(r.best);
    }
    if (picked.length < count) {
        // A prefecture with fewer kinds than companions: borrow from the rest of the region.
        for (const i of strongest(units, all.filter(j => units[j].region === region))) take(i);
    }
    return picked;
}

// Draws from several ranked lists in turn, starting at list `turn`; returns the list to start from next.
// A list is skipped past anything `ok` rejects.
function mixPick(lists: readonly (readonly number[])[], want: number, ok: (i: number) => boolean, take: (i: number) => void, turn = 0): number {
    const next = lists.map(() => 0);
    let taken = 0, idle = 0, k = turn % lists.length;
    for (; taken < want && idle < lists.length; k = (k + 1) % lists.length) {
        const list = lists[k];
        while (next[k] < list.length && !ok(list[next[k]])) next[k]++;
        if (next[k] >= list.length) { idle++; continue; }
        idle = 0;
        take(list[next[k]++]);
        taken++;
    }
    return k;
}

const sortedBy = (items: readonly number[], score: (item: number) => number, descending: boolean) =>
    [...items].sort((a, b) => descending ? score(b) - score(a) : score(a) - score(b));

/**
 * Mists for screen 4: `candidates` are the undiscovered yokai of the region, `anchor` the one met last.
 * shown (what is on screen now) mostly stays, only re-tiered, so the same mists visibly thicken or thin.
 * Kinds in metKinds (already chosen) are left out of both the kept and the new mists, until nothing else is left.
 */
export function selectMists(units: readonly Unit[], candidates: readonly number[], anchor: number, shown: readonly number[], views: readonly SimilarityView[], metKinds: ReadonlySet<string> = new Set()):
    { index: number; tier: 1 | 2 | 3 }[] {
    const sim = similarityTo(anchor, candidates, views);
    const at = new Map(candidates.map((c, j) => [c, j] as const));
    const combined = (i: number) => sim.combined[at.get(i)!];

    const picked: number[] = [];
    const inPicked = new Set<number>();
    const kindCount = new Map<string, number>();
    let cap = MIST_KIND_CAP;
    // A mist just swapped out does not come straight back (unless nothing else is left).
    let avoid = new Set<number>();
    let blocked: ReadonlySet<string> = metKinds;
    const ok = (i: number) => !inPicked.has(i) && !avoid.has(i) && !blocked.has(units[i].kind) && (kindCount.get(units[i].kind) ?? 0) < cap;
    const take = (i: number) => { picked.push(i); inPicked.add(i); kindCount.set(units[i].kind, (kindCount.get(units[i].kind) ?? 0) + 1); };

    // Shown mists minus the met one (not a candidate any more): the least like the new anchor fade, the rest stay.
    const live = [...new Set(shown)].filter(i => at.has(i) && !metKinds.has(units[i].kind));
    const keepCount = Math.max(0, live.length - MIST_FADE);
    for (const i of sortedBy(live, combined, true)) if (picked.length < keepCount && ok(i)) take(i);

    avoid = new Set(live);
    const lists = (subset: readonly number[]) => MIST_MIX.map(name => {
        if (name === 'far') return sortedBy(subset, combined, false);
        const pct = name === 'combined' ? undefined : sim.byView[name];
        return sortedBy(subset, i => (pct ? pct[at.get(i)!] : null) ?? combined(i) - 1, true);
    });
    const placeKnown = candidates.filter(i => units[i].place !== null);
    const placeHave = picked.filter(i => units[i].place !== null).length;
    const turn = mixPick(lists(placeKnown), Math.min(MIST_PLACE_QUOTA - placeHave, MIST_TOTAL - picked.length), ok, take);
    const ranked = lists(candidates);
    mixPick(ranked, MIST_TOTAL - picked.length, ok, take, turn);
    // Too few mists to choose from: let a kind repeat or a dropped mist return rather than show fewer.
    avoid = new Set();
    cap = Infinity;
    mixPick(ranked, MIST_TOTAL - picked.length, ok, take);
    // Last resort: a kind already chosen may show up again.
    blocked = new Set();
    mixPick(ranked, MIST_TOTAL - picked.length, ok, take);

    const order = sortedBy(picked, combined, true);
    return order.map((index, rank) => ({ index, tier: (3 - Math.floor(rank * 3 / order.length)) as 1 | 2 | 3 }));
}

/**
 * The summoned yokai. The first SUMMON_ROUNDS * chosen.length come in rounds (each chosen yokai in turn
 * calls its own most similar uncalled one); the rest are the nationwide candidates most like any chosen
 * yokai, at least one per prefecture (rounds count) and at most SUMMON_KIND_CAP per kind. When the rules
 * cannot all hold, the order of priority is: the total, every caller's rounds, a yokai per prefecture, the kind cap.
 * Returned grouped by caller; within a caller in walking order (nearest neighbour from that chosen yokai),
 * with `order` = wave position (rounds first).
 */
export function selectSummons(units: readonly Unit[], candidates: readonly number[], chosen: readonly number[], views: readonly SimilarityView[], count = PARADE_TOTAL - chosen.length):
    { index: number; caller: number; order: number; near: number }[] {
    const scores = chosen.map(c => similarityTo(c, candidates, views).combined);
    const at = new Map(candidates.map((c, j) => [c, j] as const));
    const best = new Map<number, { score: number; caller: number }>();
    chosen.forEach((_, caller) => candidates.forEach((i, j) => {
        const cur = best.get(i);
        if (!cur || scores[caller][j] > cur.score) best.set(i, { score: scores[caller][j], caller });
    }));

    const picked: number[] = [];
    const inPicked = new Set<number>();
    const kindCount = new Map<string, number>();
    const take = (i: number) => { picked.push(i); inPicked.add(i); kindCount.set(units[i].kind, (kindCount.get(units[i].kind) ?? 0) + 1); };
    const roundCaller = new Map<number, number>();
    const roundOrder = new Map<number, number>();
    const free = (i: number, cap: number) => !inPicked.has(i) && (kindCount.get(units[i].kind) ?? 0) < cap;

    const perCaller = chosen.map((_, caller) => sortedBy(candidates, i => scores[caller][at.get(i)!], true));
    for (let turn = 0; turn < SUMMON_ROUNDS * chosen.length && picked.length < count; turn++) {
        const caller = turn % chosen.length;
        const mine = perCaller[caller];
        const i = mine.find(j => free(j, SUMMON_KIND_CAP)) ?? mine.find(j => free(j, Infinity));
        if (i === undefined) break;
        take(i);
        roundCaller.set(i, caller);
        roundOrder.set(i, turn);
    }

    const ranked = sortedBy(candidates, i => best.get(i)!.score, true);
    const reserved = new Set(picked.map(i => units[i].prefecture));
    // One per prefecture first (strongest first so the kind cap is spent on the best), then the rest;
    // each step retries without the kind cap so a rule never leaves a prefecture or the total short.
    for (const [cap, perPrefecture] of [[SUMMON_KIND_CAP, true], [Infinity, true], [SUMMON_KIND_CAP, false], [Infinity, false]] as const) {
        for (const i of ranked) {
            if (picked.length >= count) break;
            if (!free(i, cap) || (perPrefecture && reserved.has(units[i].prefecture))) continue;
            take(i);
            reserved.add(units[i].prefecture);
        }
    }

    const callerOf = (i: number) => roundCaller.get(i) ?? best.get(i)!.caller;
    const rest = sortedBy(picked.filter(i => !roundOrder.has(i)), i => best.get(i)!.score, true);
    const order = new Map([...roundOrder, ...rest.map((i, rank) => [i, roundOrder.size + rank] as const)]);
    // near: how alike the yokai is to the one that called it (the combined score; larger is nearer).
    const out: { index: number; caller: number; order: number; near: number }[] = [];
    chosen.forEach((c, caller) => {
        const group = picked.filter(i => callerOf(i) === caller);
        let here: Point = units[c];
        while (group.length) {
            let nearest = 0;
            for (let k = 1; k < group.length; k++) if (distanceKm(here, units[group[k]]) < distanceKm(here, units[group[nearest]])) nearest = k;
            const [i] = group.splice(nearest, 1);
            out.push({ index: i, caller, order: order.get(i)!, near: scores[caller][at.get(i)!] });
            here = units[i];
        }
    });
    return out;
}

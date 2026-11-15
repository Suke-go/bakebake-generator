// Server side of /hyakki: reads data/hyakki/ once, applies the rules in hyakki.ts and shapes API answers.
// Mist answers never carry a name, kind or picture id; the pin only lives inside one function call.
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import type { Card, Light, Mist, Point, RegionKey } from './hyakki-types';
import {
    REGIONS, CHOSEN_COUNT, VIEW_WEIGHTS, selectBuddies, selectMists, selectSummons, distanceKm,
    type SimilarityView, type Unit,
    similarityTo,
} from './hyakki';

const DIR = path.join(process.cwd(), 'data', 'hyakki');
const PARADE_REST = 95;            // the parade is one hundred with the five
const TWIN_MISTS = 5;         // of the twelve mists, how many hold an account also told in another prefecture
const ECHOES = 3;            // per caller: how many twins answer aloud
const TWINS_PER_CALLER = 6;  // per caller: how many twins are drawn in before distant relations fill the parade
type Twin = { key: string; score: number; mine: string; theirs: string };
const GEO_PATH = path.join(process.cwd(), 'data', 'geo', 'gadm41_JPN_2.json');
const TEXT_DIM = 384;
const SHAPE_DIM = 512;
const MAX_LIST = 40;
const IMAGE_TOKEN = /^[A-Za-z0-9_-]{1,120}$/;

/** A bad request (HTTP 400). Anything else thrown here means the data is unavailable (503). */
export class HyakkiInputError extends Error {}

type RawUnit = Unit & { sourceRecord: string; sourceName: string; image: string; imageSourceUrl: string };
type Texts = Record<string, { suitable: true; hint: string; desc: string; record: string } | { suitable: false }>;
type Ring = [number, number][];
type Area = { prefecture: string; municipality: string; box: [number, number, number, number]; polygons: Ring[][] };

let loaded: Promise<{
    units: RawUnit[]; texts: Texts; twins: Record<string, Twin[]>; byKey: Map<string, number>; byId: Map<string, number>; images: Set<string>; views: SimilarityView[]; shape: boolean;
}> | null = null;

async function readOptional(file: string): Promise<Buffer | null> {
    try { return await readFile(path.join(DIR, file)); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
}
const floats = (buf: Buffer) => new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const dot = (v: Float32Array, a: number, b: number, dim: number) => {
    let s = 0;
    for (let k = 0, x = a * dim, y = b * dim; k < dim; k++) s += v[x + k] * v[y + k];
    return s;
};

function load() {
    loaded ??= (async () => {
        const [rawUnits, texts, textBuf, shapeKindsBuf, shapeBuf] = await Promise.all([
            readFile(path.join(DIR, 'units.json'), 'utf8').then(JSON.parse) as Promise<RawUnit[]>,
            readFile(path.join(DIR, 'texts.json'), 'utf8').then(JSON.parse) as Promise<Texts>,
            readFile(path.join(DIR, 'text-vectors.f32')),
            readOptional('shape-kinds.json'),
            readOptional('shape-vectors.f32'),
        ]);
        const textVectors = floats(textBuf);
        if (textVectors.length !== rawUnits.length * TEXT_DIM) throw new Error('text-vectors.f32 does not match units.json');
        // Only yokai with a story written for children and a picture on disk can appear (SPEC 5.2);
        // keep each one's row in the vector file.
        const pictures = new Set(await readdir(path.join(DIR, 'silhouettes')));
        const rows: number[] = [];
        const units = rawUnits.filter((u, i) => { const ok = texts[u.key]?.suitable === true && pictures.has(`${u.image}.png`); if (ok) rows.push(i); return ok; });

        // Every story shares a large common part, which made all of them look alike (cosines of 0.93-0.99). Take the
        // mean story out and compare what is left: then a fireball that roars up a river finds the other one that does.
        const lore = new Float32Array(units.length * TEXT_DIM);
        const mean = new Float64Array(TEXT_DIM);
        for (const r of rows) for (let d = 0; d < TEXT_DIM; d++) mean[d] += textVectors[r * TEXT_DIM + d] / rows.length;
        rows.forEach((r, a) => {
            let norm = 0;
            for (let d = 0; d < TEXT_DIM; d++) { const x = textVectors[r * TEXT_DIM + d] - mean[d]; lore[a * TEXT_DIM + d] = x; norm += x * x; }
            norm = Math.sqrt(norm) || 1;
            for (let d = 0; d < TEXT_DIM; d++) lore[a * TEXT_DIM + d] /= norm;
        });
        const views: SimilarityView[] = [{ name: 'lore', weight: VIEW_WEIGHTS.lore, score: (a, b) => dot(lore, a, b, TEXT_DIM) }];
        let shape = false;
        if (shapeKindsBuf && shapeBuf) {
            const kinds = JSON.parse(shapeKindsBuf.toString('utf8')) as string[] | Record<string, unknown>;
            const names = Array.isArray(kinds) ? kinds : Object.keys(kinds);
            const vectors = floats(shapeBuf);
            if (vectors.length === names.length * SHAPE_DIM) {
                const row = new Map(names.map((k, i) => [k, i] as const));
                views.push({
                    name: 'shape', weight: VIEW_WEIGHTS.shape,
                    score: (a, b) => { const x = row.get(units[a].kind), y = row.get(units[b].kind); return x === undefined || y === undefined ? null : dot(vectors, x, y, SHAPE_DIM); },
                });
                shape = true;
            } else console.warn('hyakki: shape-vectors.f32 does not match shape-kinds.json; shape view skipped');
        }
        const twinsBuf = await readOptional('twins.json');
        const twins = twinsBuf ? JSON.parse(twinsBuf.toString('utf8')) as Record<string, Twin[]> : {};
        return { units, texts, twins, byKey: new Map(units.map((u, i) => [u.key, i] as const)), byId: new Map(units.map((u, i) => [u.id, i] as const)), images: new Set(units.map(u => u.image)), views, shape };
    })().catch(error => { loaded = null; throw error; });
    return loaded;
}

let loadedGeo: Promise<Area[]> | null = null;
function loadGeo() {
    loadedGeo ??= readFile(GEO_PATH, 'utf8').then(text => {
        const collection = JSON.parse(text) as { features: { properties: { NL_NAME_1: string; NL_NAME_2: string }; geometry: { type: string; coordinates: unknown } }[] };
        return collection.features.map(f => {
            const polygons = (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates) as Ring[][];
            let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
            for (const poly of polygons) for (const [lon, lat] of poly[0]) { w = Math.min(w, lon); e = Math.max(e, lon); s = Math.min(s, lat); n = Math.max(n, lat); }
            return { prefecture: f.properties.NL_NAME_1, municipality: f.properties.NL_NAME_2, box: [w, s, e, n], polygons } as Area;
        });
    }).catch(error => { loadedGeo = null; throw error; });
    return loadedGeo;
}

function inRing(ring: Ring, lon: number, lat: number): boolean {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i], [xj, yj] = ring[j];
        if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
}
const inArea = (area: Area, p: Point) => area.box[0] <= p.lon && p.lon <= area.box[2] && area.box[1] <= p.lat && p.lat <= area.box[3]
    && area.polygons.some(poly => inRing(poly[0], p.lon, p.lat) && !poly.slice(1).some(hole => inRing(hole, p.lon, p.lat)));

/** The town and prefecture under the pin; a pin off the land (or outside the chosen region) counts as
 *  the nearest prefecture of the region (distance to the nearest outline vertex is enough for that). */
function locate(areas: Area[], regionPrefectures: Set<string>, p: Point): { prefecture: string; municipality: string | null } {
    const hit = areas.find(a => inArea(a, p));
    if (hit && regionPrefectures.has(hit.prefecture)) return { prefecture: hit.prefecture, municipality: hit.municipality };
    let best = { prefecture: '', km: Infinity };
    for (const a of areas) {
        if (!regionPrefectures.has(a.prefecture)) continue;
        for (const poly of a.polygons) for (const [lon, lat] of poly[0]) {
            if (Math.abs(lat - p.lat) > best.km / 111 + 0.01 && best.km < Infinity) continue;
            const km = distanceKm(p, { lat, lon });
            if (km < best.km) best = { prefecture: a.prefecture, km };
        }
    }
    if (!best.prefecture) throw new Error('no prefecture outline in this region');
    return { prefecture: best.prefecture, municipality: null };
}

const level = (u: Unit) => (u.place ? 'place' : 'prefecture') as Mist['level'];

function card(data: Awaited<ReturnType<typeof load>>, i: number): Card {
    const u = data.units[i];
    const text = data.texts[u.key] as { desc: string; tease?: string };
    return {
        id: u.id, name: u.name, prefecture: u.prefecture, place: u.place, level: level(u), lat: u.lat, lon: u.lon,
        desc: text.desc, tease: text.tease ?? '',
        recordName: u.sourceName.normalize('NFKC').split(/[,、]/).map(n => n.trim()).filter(Boolean).join('、'),
        picture: `/api/hyakki?picture=${encodeURIComponent(u.image)}`,
        storyUrl: `https://www.nichibun.ac.jp/YoukaiCard/${u.sourceRecord}.html`,
        pictureSourceUrl: u.imageSourceUrl,
    };
}

function checkRegion(region: unknown): RegionKey {
    if (typeof region !== 'string' || !(REGIONS as readonly string[]).includes(region)) throw new HyakkiInputError('Unknown region');
    return region as RegionKey;
}
function checkIds(byId: Map<string, number>, ids: unknown, min: number, max: number): number[] {
    if (!Array.isArray(ids) || ids.length < min || ids.length > max) throw new HyakkiInputError('Bad id list');
    const out = ids.map(id => (typeof id === 'string' ? byId.get(id) : undefined));
    if (out.some(i => i === undefined)) throw new HyakkiInputError('Unknown id');
    return out as number[];
}

export async function hyakkiBuddies(region: unknown, lat: number, lon: number): Promise<{ buddies: Card[] }> {
    const key = checkRegion(region);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < 20 || lat > 46.5 || lon < 122 || lon > 154) throw new HyakkiInputError('Bad position');
    const [data, areas] = await Promise.all([load(), loadGeo()]);
    const prefectures = new Set(data.units.filter(u => u.region === key).map(u => u.prefecture));
    const where = locate(areas, prefectures, { lat, lon });
    return { buddies: selectBuddies(data.units, where, key).map(i => card(data, i)) };
}

export async function hyakkiMists(region: unknown, chosen: unknown, shown: unknown): Promise<{ mists: Mist[] }> {
    const key = checkRegion(region);
    const data = await load();
    const met = checkIds(data.byId, chosen, 1, CHOSEN_COUNT);
    const onScreen = shown === undefined ? [] : checkIds(data.byId, shown, 0, MAX_LIST);
    const taken = new Set(met);
    const candidates = data.units.map((_, i) => i).filter(i => data.units[i].region === key && !taken.has(i));
    const metKinds = new Set(met.map(i => data.units[i].kind));
    const picked = selectMists(data.units, candidates, met[met.length - 1], onScreen, data.views, metKinds);
    // At least TWIN_MISTS of the twelve hold an account that is also told in another prefecture, so that a call is
    // seldom met with silence. Newly arriving mists without a twin give way, least similar first; mists already on
    // screen are never swapped.
    const hasTwin = (i: number) => (data.twins[data.units[i].key] ?? []).some(t => data.byKey.has(t.key));
    const staying = new Set(onScreen);
    const inPicked = new Set(picked.map(m => m.index));
    const pool = candidates.filter(i => hasTwin(i) && !inPicked.has(i) && !metKinds.has(data.units[i].kind));
    const alike = similarityTo(met[met.length - 1], pool, data.views).combined;
    const incoming = pool.map((i, j) => ({ i, s: alike[j] })).sort((a, b) => b.s - a.s).map(o => o.i);
    for (let k = picked.length - 1; k >= 0 && incoming.length && picked.filter(m => hasTwin(m.index)).length < TWIN_MISTS; k--) {
        if (!hasTwin(picked[k].index) && !staying.has(picked[k].index)) picked[k] = { index: incoming.shift()!, tier: 2 };
    }
    const mists = picked.map(({ index, tier }): Mist => {
        const u = data.units[index];
        return { id: u.id, lat: u.lat, lon: u.lon, level: level(u), tier, hint: (data.texts[u.key] as { hint: string }).hint, tease: (data.texts[u.key] as { tease?: string }).tease ?? '' };
    });
    return { mists };
}

export async function hyakkiMeet(id: unknown): Promise<{ card: Card }> {
    const data = await load();
    const [i] = checkIds(data.byId, [id], 1, 1);
    return { card: card(data, i) };
}

export async function hyakkiSummon(chosen: unknown): Promise<{ lights: Light[] }> {
    const data = await load();
    const met = checkIds(data.byId, chosen, CHOSEN_COUNT, CHOSEN_COUNT);
    if (new Set(met).size !== met.length) throw new HyakkiInputError('Repeated id');
    const taken = new Set(met);
    const candidates = data.units.map((_, i) => i).filter(i => !taken.has(i));
    // Twins first. Each caller in turn draws in the unit, not yet drawn, that holds the closest retelling of one of
    // its own records in another prefecture. A caller with no twin draws none: its account is told only here.
    const drawn = new Map<number, { caller: number; order: number; score: number; line: string; mine: string; rank: number }>();
    const lists = met.map(c => (data.twins[data.units[c].key] ?? [])
        .map(t => ({ ...t, index: data.byKey.get(t.key) }))
        .filter((t): t is Twin & { index: number } => t.index !== undefined && !taken.has(t.index)));
    for (let round = 0; round < TWINS_PER_CALLER; round++) {
        lists.forEach((list, caller) => {
            const next = list.find(t => !drawn.has(t.index));
            if (next) drawn.set(next.index, { caller, order: drawn.size, score: next.score, line: next.theirs, mine: next.mine, rank: round });
        });
    }
    // Distant relations fill the rest, by the combined similarity and without a place reserved for each prefecture.
    const others = selectSummons(data.units, candidates.filter(i => !drawn.has(i)), met, data.views, PARADE_REST - drawn.size, false);
    const light = (index: number, caller: number, order: number, near: number, twin: boolean, tease: string, callerLine: string): Light =>
        ({ id: data.units[index].id, lat: data.units[index].lat, lon: data.units[index].lon, caller, order, near, twin, tease, callerLine, silhouette: `/api/hyakki?silhouette=${data.units[index].id}`,
            picture: `/api/hyakki?picture=${encodeURIComponent((data.units[index] as RawUnit).image)}`, region: data.units[index].region as RegionKey });
    const lights = [
        ...[...drawn].map(([index, d]) => light(index, d.caller, d.order, 1 + d.score, true, d.rank < ECHOES ? d.line : '', d.rank < ECHOES ? d.mine : '')),
        ...others.map(o => light(o.index, o.caller, drawn.size + o.order, o.near, false, '', '')),
    ].sort((a, b) => a.caller - b.caller);
    return { lights };
}

/** PNG bytes of the mist's silhouette, or null when it is not drawn (yet). */
export async function hyakkiSilhouette(id: unknown): Promise<Buffer | null> {
    const data = await load();
    const [i] = checkIds(data.byId, [id], 1, 1);
    return readImage('silhouettes', data.units[i].image, '.png');
}

/** JPEG bytes for a token from Card.picture; only images of known yokai can be read. */
export async function hyakkiPicture(token: unknown): Promise<Buffer | null> {
    const data = await load();
    if (typeof token !== 'string' || !IMAGE_TOKEN.test(token) || !data.images.has(token)) throw new HyakkiInputError('Unknown picture');
    // The small copy (scripts/hyakki/build_thumbs.py) when there is one: the page never shows a picture above 160 px.
    return await readImage('thumbs', token, '.jpg') ?? readImage('images', token, '.jpg');
}

async function readImage(folder: string, image: string, extension: string): Promise<Buffer | null> {
    const root = path.join(DIR, folder);
    const file = path.join(root, image + extension);
    if (!IMAGE_TOKEN.test(image) || path.dirname(file) !== root) throw new HyakkiInputError('Unknown picture');
    return readFile(file).catch(error => { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; });
}

/**
 * For the paper only (scripts/hyakki/ordinary_answers.ts): who would answer each of five chosen units under the
 * ordinary construction, in which units are compared by the mean of their records' vectors together with the
 * pictures of their kinds. Returns, per caller, the keys of the three units most similar to it among those drawn in.
 */
export async function hyakkiOrdinaryAnswers(chosenKeys: readonly string[]): Promise<{ caller: string; answer: string }[]> {
    const data = await load();
    const met = chosenKeys.map(k => data.byKey.get(k)).filter((i): i is number => i !== undefined);
    if (met.length !== chosenKeys.length) throw new HyakkiInputError('Unknown key');
    const taken = new Set(met);
    const summoned = selectSummons(data.units, data.units.map((_, i) => i).filter(i => !taken.has(i)), met, data.views);
    return met.flatMap((c, caller) => summoned.filter(s => s.caller === caller).sort((a, b) => b.near - a.near).slice(0, ECHOES)
        .map(s => ({ caller: data.units[c].key, answer: data.units[s.index].key })));
}

/** For the paper only: the units in play, by key. */
export async function hyakkiPlayable(): Promise<{ key: string; region: string; kind: string }[]> {
    const data = await load();
    return data.units.map(u => ({ key: u.key, region: u.region, kind: u.kind }));
}

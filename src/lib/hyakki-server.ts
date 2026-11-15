// Server side of /hyakki: reads data/hyakki/ once, applies the rules in hyakki.ts and shapes API answers.
// Mist answers never carry a name, kind or picture id; the pin only lives inside one function call.
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import type { Card, Light, Mist, Point, RegionKey } from './hyakki-types';
import {
    REGIONS, CHOSEN_COUNT, VIEW_WEIGHTS, selectBuddies, selectMists, selectSummons, distanceKm,
    type SimilarityView, type Unit,
} from './hyakki';

const DIR = path.join(process.cwd(), 'data', 'hyakki');
const ECHOES = 3;   // per caller: how many of the nearest answer aloud
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
    units: RawUnit[]; texts: Texts; byId: Map<string, number>; images: Set<string>; views: SimilarityView[]; shape: boolean;
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
        return { units, texts, byId: new Map(units.map((u, i) => [u.id, i] as const)), images: new Set(units.map(u => u.image)), views, shape };
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
    const mists = selectMists(data.units, candidates, met[met.length - 1], onScreen, data.views, new Set(met.map(i => data.units[i].kind))).map(({ index, tier }): Mist => {
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
    const summoned = selectSummons(data.units, candidates, met, data.views);
    // The few nearest to each caller answer aloud with their one line.
    const aloud = new Set<number>();
    met.forEach((_, caller) => summoned.filter(s => s.caller === caller).sort((a, b) => b.near - a.near).slice(0, ECHOES).forEach(s => aloud.add(s.index)));
    const lights = summoned.map(({ index, caller, order, near }): Light =>
        ({ id: data.units[index].id, lat: data.units[index].lat, lon: data.units[index].lon, caller, order, near, silhouette: `/api/hyakki?silhouette=${data.units[index].id}`,
            tease: aloud.has(index) ? (data.texts[data.units[index].key] as { tease?: string }).tease ?? '' : '',
            picture: `/api/hyakki?picture=${encodeURIComponent((data.units[index] as RawUnit).image)}`, region: data.units[index].region as RegionKey }));
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

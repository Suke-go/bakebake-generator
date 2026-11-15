import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type { RegionKey } from './hyakki-types';
import {
    BUDDY_COUNT, MIST_FADE, MIST_KIND_CAP, MIST_PLACE_QUOTA, MIST_TOTAL, PARADE_TOTAL, SUMMON_KIND_CAP, SUMMON_ROUNDS,
    distanceKm, selectBuddies, selectMists, selectSummons, similarityTo, type SimilarityView, type Unit,
} from './hyakki';

// Synthetic world: a grid of prefectures, each with its own towns; a unit's "lore" position is a point
// on a line, so similarity is just closeness of that number.
const PREFECTURES = Array.from({ length: 12 }, (_, p) => `P${p}`);
const regionOf = (p: number): RegionKey => (p < 6 ? 'kanto' : 'kinki');

function world(perPrefecture = 40, kindsPerPrefecture = 8) {
    const units: Unit[] = [];
    const lore: number[] = [];
    PREFECTURES.forEach((prefecture, p) => {
        for (let n = 0; n < perPrefecture; n++) {
            const kind = `K${(p * 3 + (n % kindsPerPrefecture)) % 20}`;
            units.push({
                id: `u${units.length}`, key: `k${units.length}`, kind, name: `n${units.length}`, prefecture, region: regionOf(p),
                place: n % 5 === 0 ? `T${p}-${n % 3}` : null,
                lat: 35 + p * 0.3 + (n % 7) * 0.01, lon: 135 + (n % 11) * 0.02 + p * 0.1, records: 1 + (n % 4),
            });
            lore.push(((units.length * 7919) % 1000) / 1000);
        }
    });
    const views: SimilarityView[] = [{ name: 'lore', weight: 1, score: (a, b) => 1 - Math.abs(lore[a] - lore[b]) }];
    return { units, lore, views };
}
const idx = (units: Unit[], filter: (u: Unit) => boolean = () => true) => units.map((u, i) => i).filter(i => filter(units[i]));
const kindsOf = (units: Unit[], list: number[]) => list.map(i => units[i].kind);

test('similarity is a rank among the candidates, blended by weight, and skips views without data', () => {
    const wide: SimilarityView = { name: 'a', weight: 1, score: (_, b) => b * 1000 };
    const narrow: SimilarityView = { name: 'b', weight: 1, score: (_, b) => (b === 2 ? null : -b * 0.001) };
    const { combined, byView } = similarityTo(0, [1, 2, 3], [wide, narrow]);
    assert.deepEqual(byView.a, [0, 0.5, 1]);
    assert.deepEqual(byView.b, [1, null, 0]);
    assert.deepEqual(combined, [0.5, 0.5, 0.5]);
    const tied = similarityTo(0, [1, 2, 3], [{ name: 'a', weight: 1, score: () => 1 }]);
    assert.deepEqual(tied.combined, [0.5, 0.5, 0.5]);
    assert.deepEqual(similarityTo(0, [4], [wide]).combined, [1]);
});

test('buddies: the pin town first, then kinds the prefecture is rich in, one per kind', () => {
    const units: Unit[] = [
        { id: 'a', key: 'a', kind: 'X', name: '', prefecture: 'P', region: 'kanto', place: 'Town', lat: 0, lon: 0, records: 1 },
        { id: 'b', key: 'b', kind: 'X', name: '', prefecture: 'P', region: 'kanto', place: 'Town', lat: 0, lon: 0, records: 5 },
        // Common nationally, so a low ratio for P.
        ...Array.from({ length: 6 }, (_, n) => ({ id: `c${n}`, key: `c${n}`, kind: 'COMMON', name: '', prefecture: n < 2 ? 'P' : 'Q', region: (n < 2 ? 'kanto' : 'kinki') as RegionKey, place: null, lat: 0, lon: 0, records: 3 })),
        { id: 'r1', key: 'r1', kind: 'RARE1', name: '', prefecture: 'P', region: 'kanto', place: null, lat: 0, lon: 0, records: 2 },
        { id: 'r2', key: 'r2', kind: 'RARE2', name: '', prefecture: 'P', region: 'kanto', place: null, lat: 0, lon: 0, records: 3 },
        { id: 'r2q', key: 'r2q', kind: 'RARE2', name: '', prefecture: 'Q', region: 'kinki', place: null, lat: 0, lon: 0, records: 3 },
        { id: 'one', key: 'one', kind: 'SINGLE', name: '', prefecture: 'P', region: 'kanto', place: null, lat: 0, lon: 0, records: 1 },
    ];
    const ids = (list: number[]) => list.map(i => units[i].id);
    // The strongest unit of the pin town's kind leads; then prefecture ratio: RARE1 (only here), RARE2 (also elsewhere).
    assert.deepEqual(ids(selectBuddies(units, { prefecture: 'P', municipality: 'Town' }, 'kanto')), ['b', 'r1', 'r2']);
    // Off the land: ratio order from the start (RARE1 and X are only found here, so they tie on top).
    assert.deepEqual(ids(selectBuddies(units, { prefecture: 'P', municipality: null }, 'kanto')), ['r1', 'b', 'r2']);
});

test('buddies relax the two-record rule and borrow from the region when the prefecture is small', () => {
    const units: Unit[] = [
        { id: 'a', key: 'a', kind: 'A', name: '', prefecture: 'P', region: 'kanto', place: null, lat: 0, lon: 0, records: 1 },
        { id: 'b', key: 'b', kind: 'B', name: '', prefecture: 'P', region: 'kanto', place: null, lat: 0, lon: 0, records: 1 },
        { id: 'c', key: 'c', kind: 'C', name: '', prefecture: 'Q', region: 'kanto', place: null, lat: 0, lon: 0, records: 4 },
        { id: 'd', key: 'd', kind: 'A', name: '', prefecture: 'Q', region: 'kanto', place: null, lat: 0, lon: 0, records: 9 },
        { id: 'e', key: 'e', kind: 'E', name: '', prefecture: 'R', region: 'kinki', place: null, lat: 0, lon: 0, records: 9 },
    ];
    const picked = selectBuddies(units, { prefecture: 'P', municipality: null }, 'kanto');
    assert.equal(picked.length, BUDDY_COUNT);
    assert.deepEqual(new Set(kindsOf(units, picked)).size, 3);
    assert.ok(!picked.includes(4), 'other regions are not borrowed from');
});

test('buddies on a full world: three, distinct kinds, from the prefecture', () => {
    const { units } = world();
    for (const municipality of [null, 'T3-0', 'unknown town']) {
        const picked = selectBuddies(units, { prefecture: 'P3', municipality }, 'kanto');
        assert.equal(picked.length, BUDDY_COUNT);
        assert.equal(new Set(kindsOf(units, picked)).size, BUDDY_COUNT);
        assert.ok(picked.every(i => units[i].prefecture === 'P3'));
    }
    const inTown = selectBuddies(units, { prefecture: 'P3', municipality: 'T3-0' }, 'kanto');
    assert.equal(units[inTown[0]].place, 'T3-0');
});

test('mists: twelve, kinds at most twice, four with a known town, no chosen yokai', () => {
    const { units, views } = world();
    const candidates = idx(units, u => u.region === 'kanto').filter(i => i !== 5);
    const mists = selectMists(units, candidates, 5, [], views);
    assert.equal(mists.length, MIST_TOTAL);
    assert.equal(new Set(mists.map(m => m.index)).size, MIST_TOTAL);
    const kindCounts = new Map<string, number>();
    for (const m of mists) kindCounts.set(units[m.index].kind, (kindCounts.get(units[m.index].kind) ?? 0) + 1);
    assert.ok([...kindCounts.values()].every(n => n <= MIST_KIND_CAP));
    assert.ok(mists.filter(m => units[m.index].place !== null).length >= MIST_PLACE_QUOTA);
    assert.ok(mists.every(m => m.index !== 5 && units[m.index].region === 'kanto'));
});

test('mists: tiers are rank thirds of what is returned, thickest for the most similar', () => {
    const { units, views } = world();
    const candidates = idx(units, u => u.region === 'kanto').filter(i => i !== 5);
    const mists = selectMists(units, candidates, 5, [], views);
    const count = (t: number) => mists.filter(m => m.tier === t).length;
    assert.deepEqual([count(1), count(2), count(3)], [4, 4, 4]);
    const sim = (i: number) => views[0].score(5, i)!;
    const lowest3 = Math.min(...mists.filter(m => m.tier === 3).map(m => sim(m.index)));
    const highest1 = Math.max(...mists.filter(m => m.tier === 1).map(m => sim(m.index)));
    assert.ok(lowest3 >= highest1, 'tier 3 never less similar than tier 1');
    assert.ok(mists.some(m => m.tier === 1), 'low similarity still shows as tier 1');
});

test('mists: after a meeting the four least like the new yokai fade and new ones appear in their place', () => {
    const { units, views } = world();
    const all = idx(units, u => u.region === 'kanto');
    const first = selectMists(units, all.filter(i => i !== 5), 5, [], views);
    const shown = first.map(m => m.index);
    const met = shown[0];
    const next = selectMists(units, all.filter(i => i !== 5 && i !== met), met, shown, views);
    const nextIds = new Set(next.map(m => m.index));
    const left = shown.filter(i => i !== met);
    const sim = (i: number) => views[0].score(met, i)!;
    const faded = left.filter(i => !nextIds.has(i));
    const stayed = left.filter(i => nextIds.has(i));
    const fresh = next.filter(m => !shown.includes(m.index));
    assert.equal(next.length, MIST_TOTAL, 'back to the full count');
    assert.ok(!nextIds.has(met));
    assert.equal(faded.length, MIST_FADE);
    assert.ok(faded.every(f => stayed.every(s => sim(f) <= sim(s))), 'the faded are the least like the new yokai');
    assert.equal(fresh.length, MIST_FADE + 1, 'one new mist per faded one, and one for the met mist');
    assert.ok(fresh.every(m => !shown.includes(m.index)), 'no id that was on screen comes back');
    assert.ok(stayed.every(s => next.some(m => m.index === s)));
    const kindCounts = new Map<string, number>();
    for (const m of next) kindCounts.set(units[m.index].kind, (kindCounts.get(units[m.index].kind) ?? 0) + 1);
    assert.ok([...kindCounts.values()].every(n => n <= MIST_KIND_CAP));
    assert.ok(next.filter(m => units[m.index].place !== null).length >= MIST_PLACE_QUOTA);
    // The new ones are not all alike: at least one is among the less similar half.
    const median = [...fresh].map(m => sim(m.index)).sort((a, b) => a - b)[Math.floor(fresh.length / 2)];
    assert.ok(fresh.some(m => sim(m.index) < median) && fresh.some(m => sim(m.index) > median));
    // Kept mists are re-tiered, so some change.
    const tierBefore = new Map(first.map(m => [m.index, m.tier]));
    assert.ok(next.some(m => tierBefore.has(m.index) && tierBefore.get(m.index) !== m.tier));
});

test('mists leave out kinds already chosen, in kept and new mists, and only give that up when nothing else is left', () => {
    const { units, views } = world();
    const all = idx(units, u => u.region === 'kanto');
    const met = new Set([units[5].kind, units[6].kind, units[7].kind]);
    const candidates = all.filter(i => i !== 5 && i !== 6);
    const first = selectMists(units, candidates, 5, [], views, new Set([units[5].kind]));
    assert.ok(first.every(m => units[m.index].kind !== units[5].kind));
    const shown = selectMists(units, candidates, 5, [], views).map(m => m.index);
    const next = selectMists(units, candidates, 6, shown, views, met);
    assert.equal(next.length, MIST_TOTAL);
    assert.ok(next.every(m => !met.has(units[m.index].kind)), 'neither kept nor new mists share a chosen kind');
    // A region whose every remaining yokai shares a chosen kind still gets mists.
    const same = units.slice(0, 20).map(u => ({ ...u, kind: 'ONE' }));
    assert.equal(selectMists(same, same.map((_, i) => i).slice(1), 0, [], views, new Set(['ONE'])).length, MIST_TOTAL);
});

test('mists with a tiny region: never a dead end and never fewer than exist', () => {
    const { units, views } = world(4, 2);
    const all = idx(units, u => u.region === 'kinki');
    const mists = selectMists(units, all.slice(1), all[0], [], views);
    assert.equal(mists.length, Math.min(MIST_TOTAL, all.length - 1));
    const few = selectMists(units, all.slice(1, 4), all[0], [], views);
    assert.equal(few.length, 3);
    // Everything one kind: the kind cap relaxes.
    const same = units.slice(0, 20).map(u => ({ ...u, kind: 'ONE' }));
    assert.equal(selectMists(same, same.map((_, i) => i).slice(1), 0, [], views).length, MIST_TOTAL);
});

test('summon: exactly 95 more, a yokai from every prefecture, kinds at most five, callers assigned', () => {
    const { units, views } = world(60);
    const chosen = [0, 70, 150, 250, 400];
    const candidates = idx(units).filter(i => !chosen.includes(i));
    const lights = selectSummons(units, candidates, chosen, views);
    assert.equal(lights.length, PARADE_TOTAL - chosen.length);
    assert.equal(new Set(lights.map(l => l.index)).size, lights.length);
    assert.ok(lights.every(l => !chosen.includes(l.index)));
    assert.deepEqual(new Set(lights.map(l => units[l.index].prefecture)), new Set(PREFECTURES));
    const kinds = new Map<string, number>();
    for (const l of lights) kinds.set(units[l.index].kind, (kinds.get(units[l.index].kind) ?? 0) + 1);
    assert.ok([...kinds.values()].every(n => n <= SUMMON_KIND_CAP), 'kind cap');
    assert.deepEqual([...new Set(lights.map(l => l.order))].sort((a, b) => a - b), lights.map((_, k) => k));
    // After the rounds, the caller is the chosen yokai it resembles most.
    for (const l of lights.filter(x => x.order >= SUMMON_ROUNDS * chosen.length)) {
        const sims = chosen.map(c => views[0].score(c, l.index)!);
        const rank = (c: number) => candidates.filter(o => views[0].score(chosen[c], o)! < views[0].score(chosen[c], l.index)!).length;
        const mine = rank(l.caller);
        assert.ok(chosen.every((_, c) => rank(c) <= mine), `caller of ${l.index}: ${sims}`);
    }
});

test('summon: the first lights come in rounds, one per chosen yokai per round, each its own most similar', () => {
    const { units, views } = world(60);
    const chosen = [0, 70, 150, 250, 400];
    const candidates = idx(units).filter(i => !chosen.includes(i));
    const lights = selectSummons(units, candidates, chosen, views);
    const byOrder = [...lights].sort((a, b) => a.order - b.order);
    const rounds = byOrder.slice(0, SUMMON_ROUNDS * chosen.length);
    rounds.forEach((l, k) => assert.equal(l.caller, k % chosen.length, `order ${k}`));
    for (let c = 0; c < chosen.length; c++) {
        assert.equal(rounds.filter(l => l.caller === c).length, SUMMON_ROUNDS);
        // Each round takes the best still-free candidate for that caller.
        const mine = rounds.filter(l => l.caller === c).map(l => views[0].score(chosen[c], l.index)!);
        assert.deepEqual(mine, [...mine].sort((a, b) => b - a));
    }
    assert.ok(new Set(lights.map(l => l.caller)).size === chosen.length);
    assert.ok(byOrder.slice(SUMMON_ROUNDS * chosen.length).every(l => l.order >= SUMMON_ROUNDS * chosen.length));
});

test('summon: grouped by caller, each group walks nearest-first from its caller', () => {
    const { units, views } = world(60);
    const chosen = [0, 70, 150, 250, 400];
    const lights = selectSummons(units, idx(units).filter(i => !chosen.includes(i)), chosen, views);
    const callers = lights.map(l => l.caller);
    assert.deepEqual(callers, [...callers].sort((a, b) => a - b), 'grouped in caller order');
    for (let c = 0; c < chosen.length; c++) {
        const group = lights.filter(l => l.caller === c).map(l => l.index);
        let here = units[chosen[c]];
        group.forEach((i, k) => {
            const step = distanceKm(here, units[i]);
            assert.ok(group.slice(k).every(o => distanceKm(here, units[o]) >= step - 1e-9), `group ${c} step ${k}`);
            here = units[i];
        });
    }
});

test('summon with few candidates still returns what exists, and relaxes the kind cap', () => {
    const { units, views } = world(10, 1);
    const same = units.map(u => ({ ...u, kind: 'ONE' }));
    const chosen = [0, 1, 2, 3, 4];
    const lights = selectSummons(same, idx(same).filter(i => !chosen.includes(i)), chosen, views);
    assert.equal(lights.length, PARADE_TOTAL - chosen.length);
    const smaller = selectSummons(units.slice(0, 30), idx(units.slice(0, 30)).filter(i => !chosen.includes(i)), chosen, views);
    assert.equal(smaller.length, 25);
});

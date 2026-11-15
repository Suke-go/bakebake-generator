// Run: npx tsx scripts/hyakki/check_geo.ts
// The viewer's land test (public/hyakki-view/geo.js) must agree with the outlines in public/hyakki/japan.json.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const geo = require('../../public/hyakki-view/geo.js') as {
    buildPolys: (f: unknown) => unknown[];
    landAt: (p: unknown[], lon: number, lat: number, only?: string) => string | null;
    nearestRegion: (p: unknown[], lon: number, lat: number, maxDeg: number) => string | null;
};
const file = JSON.parse(readFileSync('public/hyakki/japan.json', 'utf-8')) as { frames: Record<string, number[]> };
const polys = geo.buildPolys(file);

const cities: [string, number, number, string][] = [
    ['Tokyo', 139.6917, 35.6895, 'kanto'],
    ['Sapporo', 141.3545, 43.0618, 'hokkaido-tohoku'],
    ['Fukuoka', 130.4017, 33.5904, 'kyushu-okinawa'],
    ['Naha', 127.6809, 26.2124, 'kyushu-okinawa'],
    ['Osaka', 135.5023, 34.6937, 'kinki'],
    ['Matsue', 133.0505, 35.4723, 'chugoku-shikoku'],
    ['Nagano', 138.181, 36.6513, 'chubu'],
];
for (const [name, lon, lat, region] of cities) assert.equal(geo.landAt(polys, lon, lat), region, `${name} should be land in ${region}`);
assert.equal(geo.landAt(polys, 150, 30), null, 'open sea must not be land');
assert.equal(geo.landAt(polys, 139.6917, 35.6895, 'kinki'), null, 'a region filter must exclude other regions');
assert.equal(geo.nearestRegion(polys, 139.75, 35.55, 0.05) !== null, true, 'Tokyo Bay shore is within slack');
assert.equal(geo.nearestRegion(polys, 150, 30, 0.05), null, 'open sea is out of slack');
for (const k of ['japan', 'hokkaido-tohoku', 'kanto', 'chubu', 'kinki', 'chugoku-shikoku', 'kyushu-okinawa']) assert.equal(file.frames[k]?.length, 4, `frame ${k}`);
console.log(`geo ok: ${cities.length} cities, ${polys.length} polygons`);

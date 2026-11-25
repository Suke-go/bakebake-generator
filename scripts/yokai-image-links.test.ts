import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { buildYokaiImageIndex, findYokaiImages, type YokaiImageRecord } from '../src/lib/yokai-image-links';

const record: YokaiImageRecord = { id: 'kappa', name: '河童；カッパ', tags: ['赤', '踊る'], imageUrl: 'https://www.nichibun.ac.jp/YoukaiGazou/image/test.jpg', sourceUrl: 'https://www.nichibun.ac.jp/cgi-bin/YoukaiGazou/card.cgi?identifier=test' };
test('whole names and readings link, not tags or substrings', () => {
    const index = buildYokaiImageIndex([record]);
    assert.equal(findYokaiImages(index, '河童（俗信）', 'カッパ').length, 1);
    assert.equal(findYokaiImages(index, '別名', 'かっぱ').length, 1);
    assert.equal(findYokaiImages(index, '赤').length, 0);
    assert.equal(findYokaiImages(index, '河童橋').length, 0);
    assert.equal(findYokaiImages(index, '').length, 0);
    assert.equal(buildYokaiImageIndex([{ ...record, imageUrl: 'javascript:alert(1)' }]).size, 0);
});

test('real image catalog joins geographic records without inventing locations', () => {
    const catalog = JSON.parse(readFileSync('public/youkai-gazou-catalog.json', 'utf8'));
    const geo = JSON.parse(readFileSync('data/nichibun/nichibun_enriched.json', 'utf8'));
    const index = buildYokaiImageIndex(catalog.records);
    const linked = geo.filter((item: { name: string; name_reading: string }) => findYokaiImages(index, item.name, item.name_reading).length > 0);
    assert.ok(linked.length > 0);
    assert.ok(linked.length < geo.length);
    console.log(`${linked.length}/${geo.length} geographic records have same-name images`);
});

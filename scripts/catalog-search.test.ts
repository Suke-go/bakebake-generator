import assert from 'node:assert/strict';
import test from 'node:test';
import { catalogScore } from '../src/lib/catalog-search';
import { getYokaiGeoFeatureCollection } from '../src/lib/yokai-geo';

test('blank search, kana normalization, AND terms and approximate matches', () => {
    assert.equal(catalogScore('河童 カッパ 赤', '  '), 1);
    assert.equal(catalogScore('河童 カッパ 赤', 'かっぱ'), 1);
    assert.equal(catalogScore('河童 カッパ 赤', 'ｶｯﾊﾟ 赤'), 1);
    assert.equal(catalogScore('河童 カッパ 赤', '河童 青'), 0);
    assert.ok(catalogScore('からかさおばけ', 'からかさおばき') > 0);
    assert.equal(catalogScore('河童', '宇宙人'), 0);
});

test('geo pagination returns all valid records with no overlap', async () => {
    const ids = new Set<string>();
    let offset: number | null = 0;
    let count = 0;
    let total = 0;
    while (offset !== null) {
        const batch = await getYokaiGeoFeatureCollection({ limit: 10000, offset, geoLevel: ['all'], includeSummary: true });
        total = batch.metadata.total_records;
        for (const feature of batch.features) {
            const id = String(feature.id);
            assert.ok(!ids.has(id), `duplicate ${id}`);
            ids.add(id);
        }
        count += batch.features.length;
        const next = batch.metadata.next_offset;
        assert.ok(next === null || next > offset);
        offset = next;
    }
    assert.equal(count, total); // This frozen local dataset has coordinates on every record.
    assert.ok(count > 10000);
    console.log(`Verified ${count} geographic records across pages`);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { relatedYokai } from '../src/lib/related-yokai';
const make = (id: string, name: string, summary: string, image?: string) => ({ properties: { id, name, summary, primary_image_url: image } });
test('related records explain actual overlap, preserve different pictures, exclude self and duplicates', () => {
    const source = make('a', '河童', '夜の池で魚を捕る。', 'a.jpg');
    const rows = [source, make('copy', '河童', source.properties.summary, 'a.jpg'), make('b', '河童', '川に住む。', 'b.jpg'), make('c', '天狗', '山に住む。')];
    const result = relatedYokai(source, rows);
    assert.deepEqual(result.map(r => r.feature.properties.id), ['b']);
    assert.equal(result[0].reason, '同じ名前「河童」');
});
test('shared words connect different names; geography alone does not', () => {
    const source = make('a', '猫', '提灯と着物を持って踊る。');
    const result = relatedYokai(source, [make('b', '狐', '着物を着て提灯を持つ。'), make('c', '狸', '山にいる。')]);
    assert.equal(result.length, 1);
    assert.match(result[0].reason, /提灯/);
    assert.match(result[0].reason, /着物/);
});

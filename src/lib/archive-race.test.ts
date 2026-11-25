import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { nameKey, nodeIndexByRecord, offerChoices, offerFrom, type StoryGraph } from './archive-race';

const graph: StoryGraph = {
    version: 'test',
    nodes: [['a'], ['b', 'b2'], ['c'], ['d'], ['e'], ['f']],
    edges: [[1, 2, 3, 4, 5], [0], [0], [0], [0], [0]],
};
const names = ['犬神', '犬神', '犬神', '狐憑き', '狐憑き', '管狐'];
const keyOf = (i: number) => names[i];

test('name keys drop genre notes and keep the first filed name', () => {
    assert.equal(nameKey('つきもの，きつね'), 'つきもの');
    assert.equal(nameKey('（俗信），写真'), '写真');
    assert.equal(nameKey('（俗信）'), '');
    assert.equal(nameKey('犬神憑，狐憑'), '犬神憑');
    assert.equal(nameKey('ヤマウバ，（山に出る妖怪）'), 'ヤマウバ');
});

test('offers at most one card with the current name and no repeated names', () => {
    assert.deepEqual(offerChoices(graph, 0, keyOf, new Set(), 3), [1, 3, 5]);
});

test('skips visited stories and relaxes the name rule rather than offering fewer cards', () => {
    assert.deepEqual(offerChoices(graph, 0, keyOf, new Set([3, 5]), 3), [1, 4, 2]);
    assert.deepEqual(offerChoices(graph, 1, keyOf, new Set(), 3), [0]);
});

test('stories filed without a name never block each other', () => {
    const unnamed = (i: number) => (i === 0 ? '犬神' : '');
    assert.deepEqual(offerChoices(graph, 0, unnamed, new Set(), 3), [1, 2, 3]);
});

test('every record ID of a variant node maps to that node', () => {
    const index = nodeIndexByRecord(graph);
    assert.equal(index.get('b'), 1);
    assert.equal(index.get('b2'), 1);
});

test('fills from further similar stories before letting a name repeat', () => {
    const keys = ['ケンムン', 'ケンムン', 'ケンムン', 'ケンムン', '河童', '水虎', 'ガラッパ'];
    const picked = offerFrom([1, 2, 3], 'ケンムン', j => keys[j], new Set(), 4, [4, 5, 6]);
    assert.deepEqual(picked, [1, 4, 5, 6]);
    // Without filler stories the rule still relaxes rather than offering fewer cards.
    assert.deepEqual(offerFrom([1, 2, 3], 'ケンムン', j => keys[j], new Set(), 3), [1, 2, 3]);
});

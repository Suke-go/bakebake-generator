import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { MAX_EVENTS_PER_BATCH, parsePlayEventBatch, validPlayPayload } from './play-log-contract';

const event = (eventType: string, payload: Record<string, unknown>, seq = 0) => ({
    eventId: '71572f83-b276-4131-a386-7c0b5200e215', seq, eventType,
    occurredAt: '2026-11-06T10:00:00Z', elapsedMs: 1200, payload,
});
const hop = { fromId: 'U426_nichibunken_0061_0001_0000', toId: '1230655_003', via: 'card', rank: 1, relation: 'act', dwellMs: 5400, revisit: false };

test('accepts a hop with its choice rank, relation and dwell time', () => {
    const parsed = parsePlayEventBatch([event('hop', hop)]);
    assert.ok(parsed);
    assert.equal(parsed[0].payload.rank, 1);
});

test('rejects free-text fields so written experiences never reach the log', () => {
    assert.equal(validPlayPayload('entry_confirmed', { appraisalIndex: 0, appraisalEdited: true, eventEdited: false, appraisalText: '嫌だった' }), false);
    assert.equal(validPlayPayload('play_started', { mode: 'journey', entry: 'experience', experience: '最近あった嫌なこと' }), false);
    assert.equal(validPlayPayload('choices_shown', { fromId: null, items: [{ id: 'a1', summary: '本文' }] }), false);
});

test('rejects unknown event types, bad ids and out-of-range values', () => {
    assert.equal(validPlayPayload('typed_text', {}), false);
    assert.equal(validPlayPayload('hop', { ...hop, toId: 'has spaces' }), false);
    assert.equal(validPlayPayload('hop', { ...hop, via: 'teleport' }), false);
    assert.equal(validPlayPayload('hop', { ...hop, dwellMs: -1 }), false);
    const { dwellMs: _omitted, ...missing } = hop;
    assert.equal(validPlayPayload('hop', missing), false);
});

test('allows optional fields to be absent and limits batch size', () => {
    assert.equal(validPlayPayload('play_started', { mode: 'journey', entry: 'random' }), true);
    assert.equal(validPlayPayload('choices_shown', { fromId: 'a1', items: [{ id: 'b2', relation: 'name' }, { id: 'c3' }] }), true);
    assert.equal(parsePlayEventBatch([]), null);
    assert.equal(parsePlayEventBatch(Array.from({ length: MAX_EVENTS_PER_BATCH + 1 }, (_, i) => event('entry_rejected', {}, i))), null);
});

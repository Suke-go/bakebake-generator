// Shared contract for archive-play logs (free map journey and the story race).
// Every event type has a closed field list, so free text a player writes
// (experience, appraisal, event) cannot reach the log even by mistake.

export const PLAY_PROTOCOL_VERSION = 'archive-play-v1';
export const PLAY_CONSENT_VERSION = 'archive-play-consent-v1';
export const PLAY_MODES = ['journey', 'race'] as const;
export type PlayMode = typeof PLAY_MODES[number];

export const MAX_EVENTS_PER_BATCH = 50;
export const MAX_BATCH_BYTES = 64 * 1024;
export const MAX_SEQ = 5000;

type FieldKind =
    | { kind: 'id' }
    | { kind: 'idOrNull' }
    | { kind: 'ids'; max: number }
    | { kind: 'label' }
    | { kind: 'int'; min: number; max: number }
    | { kind: 'intOrNull'; min: number; max: number }
    | { kind: 'bool' }
    | { kind: 'enum'; values: readonly string[] }
    | { kind: 'choices'; max: number };

const id = { kind: 'id' } as const;
const idOrNull = { kind: 'idOrNull' } as const;
const label = { kind: 'label' } as const;
const bool = { kind: 'bool' } as const;
const count = { kind: 'int', min: 0, max: 100000 } as const;
const RELATIONS = ['appearance', 'act', 'encounter', 'setting', 'name', 'all', 'semantic', 'place'] as const;
export const HOP_VIA = ['seed', 'card', 'random', 'map', 'history'] as const;

// Required fields per event; optional fields are listed with `?`.
const EVENT_FIELDS: Record<string, Record<string, FieldKind>> = {
    play_started: { mode: { kind: 'enum', values: PLAY_MODES }, entry: { kind: 'enum', values: ['experience', 'random', 'puzzle'] }, 'corpusVersion?': label },
    entry_interpreted: { appraisalCount: { kind: 'int', min: 0, max: 10 } },
    entry_failed: { stage: { kind: 'enum', values: ['interpret', 'search'] } },
    entry_confirmed: { appraisalIndex: { kind: 'int', min: -1, max: 9 }, appraisalEdited: bool, eventEdited: bool },
    entry_rejected: {},
    seeds_shown: { ids: { kind: 'ids', max: 20 } },
    choices_shown: { fromId: idOrNull, 'remaining?': { kind: 'intOrNull', min: 0, max: 200 }, 'focus?': label, 'channel?': label, items: { kind: 'choices', max: 10 } },
    word_picked: { recordId: idOrNull, label },
    focus_cleared: { label },
    hop: {
        fromId: idOrNull, toId: id, via: { kind: 'enum', values: HOP_VIA },
        rank: { kind: 'intOrNull', min: 0, max: 50 }, 'relation?': { kind: 'enum', values: RELATIONS },
        'focus?': label, dwellMs: { kind: 'int', min: 0, max: 86_400_000 }, revisit: bool,
    },
    history_moved: { direction: { kind: 'enum', values: ['back', 'forward'] }, toId: id },
    // 'left' = the journey closed without the finish button (in-app navigation).
    // A closed tab sends no play_ended; analysis treats such sessions as abandoned.
    play_ended: { reason: { kind: 'enum', values: ['finish', 'left'] }, stories: count, regions: count, path: { kind: 'ids', max: 500 } },
    // Race: a puzzle from data/archive-race/levels.json, played to its target.
    race_started: { puzzleId: label, level: { kind: 'int', min: 1, max: 9 }, startId: id, targetId: id },
    race_ended: { puzzleId: label, reason: { kind: 'enum', values: ['reached', 'gave_up', 'left'] }, moves: count, backs: count, 'km?': count, path: { kind: 'ids', max: 500 } },
    // Looking back: which route was drawn, which move the player calls decisive, and whether
    // the landscape (mountain, water, coast...) entered their choices. Choices only, never text.
    review_route_shown: { puzzleId: label, route: { kind: 'enum', values: ['mine', 'shortest', 'guide'] } },
    race_reflection: { puzzleId: label, keyMove: { kind: 'intOrNull', min: 0, max: 500 }, landscape: { kind: 'enum', values: ['used', 'noticed', 'not'] } },
};
export const PLAY_EVENT_TYPES = Object.keys(EVENT_FIELDS);
export type PlayEventType = keyof typeof EVENT_FIELDS;

export type PlayEvent = { eventId: string; seq: number; eventType: string; occurredAt: string; elapsedMs: number; payload: Record<string, unknown> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RECORD_ID = /^[\w.:-]{1,120}$/;
const isRecordId = (value: unknown): value is string => typeof value === 'string' && RECORD_ID.test(value);
const isLabel = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 40;
const isInt = (value: unknown, min: number, max: number) => Number.isInteger(value) && (value as number) >= min && (value as number) <= max;

function validField(kind: FieldKind, value: unknown): boolean {
    switch (kind.kind) {
        case 'id': return isRecordId(value);
        case 'idOrNull': return value === null || isRecordId(value);
        case 'ids': return Array.isArray(value) && value.length <= kind.max && value.every(isRecordId);
        case 'label': return isLabel(value);
        case 'int': return isInt(value, kind.min, kind.max);
        case 'intOrNull': return value === null || isInt(value, kind.min, kind.max);
        case 'bool': return typeof value === 'boolean';
        case 'enum': return typeof value === 'string' && kind.values.includes(value);
        case 'choices': return Array.isArray(value) && value.length <= kind.max && value.every(item => {
            if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
            const { id: itemId, relation, ...rest } = item as Record<string, unknown>;
            return Object.keys(rest).length === 0 && isRecordId(itemId) && (relation === undefined || (RELATIONS as readonly string[]).includes(relation as string));
        });
    }
}

export function validPlayPayload(eventType: string, payload: unknown): payload is Record<string, unknown> {
    const fields = EVENT_FIELDS[eventType];
    if (!fields || !payload || typeof payload !== 'object' || Array.isArray(payload)) return false;
    const record = payload as Record<string, unknown>;
    const allowed = new Set(Object.keys(fields).map(key => key.replace(/\?$/, '')));
    if (Object.keys(record).some(key => !allowed.has(key))) return false;
    return Object.entries(fields).every(([key, kind]) => {
        const optional = key.endsWith('?');
        const name = optional ? key.slice(0, -1) : key;
        if (!(name in record)) return optional;
        return validField(kind, record[name]);
    });
}

export function parsePlayEventBatch(value: unknown): PlayEvent[] | null {
    if (!Array.isArray(value) || value.length === 0 || value.length > MAX_EVENTS_PER_BATCH) return null;
    const events: PlayEvent[] = [];
    for (const item of value) {
        if (!item || typeof item !== 'object') return null;
        const event = item as Record<string, unknown>;
        if (typeof event.eventId !== 'string' || !UUID.test(event.eventId)) return null;
        if (!isInt(event.seq, 0, MAX_SEQ) || !isInt(event.elapsedMs, 0, 86_400_000)) return null;
        if (typeof event.occurredAt !== 'string' || Number.isNaN(Date.parse(event.occurredAt))) return null;
        if (typeof event.eventType !== 'string' || !validPlayPayload(event.eventType, event.payload)) return null;
        events.push({ eventId: event.eventId, seq: event.seq as number, eventType: event.eventType, occurredAt: event.occurredAt, elapsedMs: event.elapsedMs as number, payload: event.payload as Record<string, unknown> });
    }
    return events;
}

export function isPlayUuid(value: unknown): value is string {
    return typeof value === 'string' && UUID.test(value);
}

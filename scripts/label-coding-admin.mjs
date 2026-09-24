#!/usr/bin/env node
// Admin for the blind expert coding site (/study/coding, table label_coding_sessions).
//   node scripts/label-coding-admin.mjs create first  <sample_150.json> [label] [--base https://your-site]
//   node scripts/label-coding-admin.mjs create second <sample_150.json> [label] [--base https://your-site]
//   node scripts/label-coding-admin.mjs status
//   node scripts/label-coding-admin.mjs export <out.json>
// "first" gets all 150 records; "second" gets the 50 marked second_coder. The stratum (which reveals the
// model's prediction) is never uploaded. The link is printed once and only its hash is stored: keep it.
// Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from the environment or .env.local /
// .env.production.local. Never prints the key.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const TABLE = 'label_coding_sessions';

function loadEnv() {
    for (const f of ['.env.local', '.env.production.local']) {
        if (!existsSync(f)) continue;
        for (const line of readFileSync(f, 'utf8').split(/\r?\n/)) {
            const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
            if (!m || process.env[m[1]]) continue;
            process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
        }
    }
}

function db() {
    loadEnv();
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set');
    return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

const args = process.argv.slice(2);
const bi = args.indexOf('--base');
const base = bi >= 0 ? args.splice(bi, 2)[1].replace(/\/$/, '') : '';
const [cmd, a1, a2, a3] = args;
const client = db();

if (cmd === 'create') {
    const coder = a1;
    if (coder !== 'first' && coder !== 'second') throw new Error('coder must be first or second');
    if (!a2) throw new Error('sample json required');
    const sample = JSON.parse(readFileSync(a2, 'utf8'));
    const chosen = sample.filter((s) => coder === 'first' || s.second_coder === true).sort((x, y) => x.no - y.no);
    const items = chosen.map((s) => ({ id: String(s.id), no: s.no, name: String(s.name ?? ''), pref: String(s.pref ?? ''), summary: String(s.summary ?? '') }));
    if (items.length !== (coder === 'first' ? 150 : 50)) throw new Error(`unexpected item count ${items.length}`);
    if (new Set(items.map((i) => i.id)).size !== items.length) throw new Error('duplicate ids');
    const token = randomBytes(24).toString('hex');
    const { error } = await client.from(TABLE).insert({
        id: randomUUID(), token_hash: createHash('sha256').update(token).digest('hex'),
        coder, label: a3 ?? '', items, answers: {},
    });
    if (error) throw new Error(error.message);
    console.log(`created a ${coder} coder link with ${items.length} records. Keep this link; it is not stored and cannot be shown again:`);
    console.log(`${base || 'https://<your-site>'}/study/coding?t=${token}`);
} else if (cmd === 'status') {
    const { data, error } = await client.from(TABLE).select('coder, label, items, answers, completed_at, updated_at').order('created_at');
    if (error) throw new Error(error.message);
    for (const r of data) {
        const done = r.items.filter((it) => { const x = r.answers[it.id]; return x && x.A1 && x.B && x.H; }).length;
        console.log(`${r.coder}\t${r.label || '-'}\t${done}/${r.items.length}\t${r.completed_at ? 'completed' : 'in progress'}\tlast saved ${r.updated_at}`);
    }
} else if (cmd === 'export') {
    if (!a1) throw new Error('output path required');
    const { data, error } = await client.from(TABLE).select('coder, label, items, answers, completed_at').order('created_at');
    if (error) throw new Error(error.message);
    const out = data.map((r) => ({
        coder: r.coder, label: r.label, completed_at: r.completed_at,
        answers: Object.fromEntries(r.items.map((it) => [it.id, { no: it.no, ...(r.answers[it.id] ?? { A1: null, B: null, H: null, memo: '' }) }])),
    }));
    writeFileSync(a1, JSON.stringify(out, null, 1));
    console.log(`wrote ${out.length} coder sessions to ${a1}`);
} else {
    console.log('usage: create <first|second> <sample.json> [label] [--base URL] | status | export <out.json>');
}

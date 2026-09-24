#!/usr/bin/env node
// Admin for the contact-statement study (contact_study_sessions).
//   node scripts/contact-study-admin.mjs status
//   node scripts/contact-study-admin.mjs export-waiting <accounts.json>
//   node scripts/contact-study-admin.mjs import <items.json> [--dry-run]
//   node scripts/contact-study-admin.mjs export-results <results.json>
// Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from the environment or from
// .env.local / .env.production.local. Never prints the key.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const TABLE = 'contact_study_sessions';
const N_MIN = 6, N_MAX = 16;

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

async function rows(client, phases) {
    let q = client.from(TABLE).select('id, phase, state, created_at, updated_at').order('created_at');
    if (phases) q = q.in('phase', phases);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return data;
}

function checkItems(v) {
    if (!Array.isArray(v) || v.length !== 2) return 'need two lists';
    for (const list of v) {
        if (!Array.isArray(list) || list.length < N_MIN || list.length > N_MAX) return `each list needs ${N_MIN}-${N_MAX} records`;
        const seen = new Set();
        for (const r of list) {
            for (const k of ['id', 'name', 'region', 'summary', 'statement']) {
                if (typeof r?.[k] !== 'string') return `record field ${k} missing`;
            }
            if (!r.summary.trim() || !r.statement.trim()) return `empty summary/statement for ${r.id}`;
            if (seen.has(r.id)) return `duplicate record ${r.id}`;
            seen.add(r.id);
        }
    }
    return null;
}

const [cmd, file, flag] = process.argv.slice(2);
const client = db();

if (cmd === 'status') {
    const all = await rows(client);
    const count = {};
    for (const r of all) count[r.phase] = (count[r.phase] ?? 0) + 1;
    console.log(JSON.stringify(count));
} else if (cmd === 'export-waiting') {
    if (!file) throw new Error('output path required');
    const out = {};
    for (const r of await rows(client, ['waiting'])) {
        r.state.accounts.forEach((a, k) => { out[`${r.id}_${k}`] = a.text; });
    }
    writeFileSync(file, JSON.stringify(out, null, 1));
    console.log(`wrote ${Object.keys(out).length} accounts to ${file}`);
} else if (cmd === 'import') {
    if (!file) throw new Error('input path required');
    const items = JSON.parse(readFileSync(file, 'utf8'));
    const waiting = new Map((await rows(client, ['waiting'])).map((r) => [r.id, r]));
    let ok = 0;
    for (const [sid, v] of Object.entries(items)) {
        const r = waiting.get(sid);
        if (!r) { console.log(`skip ${sid}: not in waiting`); continue; }
        const err = checkItems(v);
        if (err) { console.log(`skip ${sid}: ${err}`); continue; }
        if (flag === '--dry-run') { ok++; continue; }
        const now = new Date().toISOString();
        const state = { ...r.state, items: v, events: [...r.state.events, { type: 'items', at: now }] };
        const { error } = await client.from(TABLE).update({ phase: 'review', state, updated_at: now })
            .eq('id', sid).eq('phase', 'waiting');
        if (error) { console.log(`fail ${sid}: ${error.message}`); continue; }
        ok++;
    }
    console.log(`${flag === '--dry-run' ? 'checked' : 'imported'} ${ok} sessions`);
} else if (cmd === 'export-results') {
    if (!file) throw new Error('output path required');
    const out = (await rows(client, ['review', 'complete'])).map((r) => ({
        session: r.id, phase: r.phase, created_at: r.created_at, updated_at: r.updated_at,
        assignment: r.state.assignment, profile: r.state.profile ?? null, accounts: r.state.accounts.map((a) => a.text),
        items: r.state.items, ratings: r.state.ratings ?? [null, null], events: r.state.events,
    }));
    writeFileSync(file, JSON.stringify(out, null, 1));
    console.log(`wrote ${out.length} sessions to ${file} (contains participants' accounts; keep within the team)`);
} else {
    console.log('usage: status | export-waiting <out> | import <in> [--dry-run] | export-results <out>');
    process.exit(1);
}

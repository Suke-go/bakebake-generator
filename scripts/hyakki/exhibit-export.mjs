#!/usr/bin/env node
// Reads the Hyakki exhibit records (hyakki_exp_responses) and says how far each consented play got.
//   node scripts/hyakki/exhibit-export.mjs                 summary only
//   node scripts/hyakki/exhibit-export.mjs <out.json>      summary, and every row written to out.json
// A row is either a full record (answers sent) or an operation log still in progress ("-progress" version), whose
// payload.reached says where the visit stopped: play, story (first survey screen), ratings, or quit (left unsent).
// Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from the environment or from
// .env.local / .env.production.local. Never prints the key. Read-only.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

for (const f of ['.env.local', '.env.production.local']) {
    if (!existsSync(f)) continue;
    for (const line of readFileSync(f, 'utf8').split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('Supabase URL or service role key is missing.'); process.exit(1); }
const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const rows = [];
for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('hyakki_exp_responses').select('*').order('created_at').range(from, from + 999);
    if (error) { console.error(error.message); process.exit(1); }
    rows.push(...data);
    if (data.length < 1000) break;
}

const day = iso => new Date(new Date(iso).getTime() + 9 * 3600e3).toISOString().slice(0, 16).replace('T', ' ');   // JST
const count = {};
console.log(`${rows.length} rows\n`);
console.log('started (JST)     state     play   events  invited  opened  answered');
for (const row of rows) {
    const p = row.payload, log = p.log ?? {}, events = log.trace?.events ?? [];
    const state = row.version.endsWith('-progress') ? p.reached : 'sent';
    count[state] = (count[state] ?? 0) + 1;
    const seconds = events.length ? Math.round(events[events.length - 1].ms / 1000) : log.seconds ?? null;
    const answered = Object.keys(p.ratings ?? p.scales ?? {}).length + (p.loreInterest == null ? 0 : 1)
        + [p.retelling, p.imagination, p.remember, p.why].filter(Boolean).length;
    console.log([day(row.created_at), state.padEnd(8), `${seconds ?? '-'}s`.padStart(5), String(events.length).padStart(7),
        String(log.chosen?.length ?? 0).padStart(7), String(log.openedIds?.length ?? log.opened ?? '-').padStart(6),
        (state === 'sent' ? String(answered) : '-').padStart(8)].join('  '));
}
console.log('\nhow far the visits got:', count);

if (process.argv[2]) {
    writeFileSync(process.argv[2], JSON.stringify(rows, null, 2));
    console.log(`wrote ${rows.length} rows to ${process.argv[2]}`);
}

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * POST /api/admin/reprint
 *
 * Admin-only endpoint to re-trigger printing for a specific survey session.
 * 1. Reset print_triggered=true, printed=false in Supabase
 * 2. Also push directly to local print daemon as immediate fallback
 */

const LOCAL_DAEMON_URL = process.env.LOCAL_PRINT_URL || 'http://localhost:5555';

function getSupabase() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return null;
    return createClient(url, key);
}

export async function POST(req: NextRequest) {
    try {
        const { id } = await req.json();
        if (!id || typeof id !== 'string') {
            return NextResponse.json({ error: 'id is required' }, { status: 400 });
        }

        const supabase = getSupabase();
        if (!supabase) {
            return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
        }

        // Fetch the record
        const { data: record, error: fetchErr } = await supabase
            .from('surveys')
            .select('id, yokai_name, yokai_desc, yokai_image_b64')
            .eq('id', id)
            .single();

        if (fetchErr || !record) {
            return NextResponse.json(
                { error: 'Record not found', detail: fetchErr?.message },
                { status: 404 }
            );
        }

        if (!record.yokai_name) {
            return NextResponse.json(
                { error: 'This session has no generated yokai yet' },
                { status: 400 }
            );
        }

        // Reset flags so online daemon re-picks it up
        const { error: updateErr } = await supabase
            .from('surveys')
            .update({ print_triggered: true, printed: false })
            .eq('id', id);

        if (updateErr) {
            return NextResponse.json(
                { error: 'Failed to reset print flags', detail: updateErr.message },
                { status: 500 }
            );
        }

        // Also try direct push to local daemon
        // If successful, immediately mark printed=true to prevent double-print
        // from Supabase poller in --both mode
        let localResult: string = 'skipped';
        try {
            const resp = await fetch(`${LOCAL_DAEMON_URL}/print`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: record.id,
                    yokai_name: record.yokai_name,
                    yokai_desc: record.yokai_desc,
                    yokai_image_b64: record.yokai_image_b64,
                }),
            });
            if (resp.ok) {
                localResult = 'sent';
                // Mark printed=true so online poller won't re-print
                await supabase.from('surveys').update({ printed: true }).eq('id', id);
            } else {
                localResult = `error:${resp.status}`;
            }
        } catch {
            localResult = 'daemon_offline';
        }

        return NextResponse.json({
            success: true,
            id,
            supabase: 'reset',
            localDaemon: localResult,
        });
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        return NextResponse.json({ error: 'Internal error', detail: message }, { status: 500 });
    }
}

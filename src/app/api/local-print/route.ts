import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/local-print
 *
 * Proxy endpoint for offline mode.
 * Forwards print data to the local print daemon running on the same PC.
 *
 * Expected JSON body:
 *   { yokai_name, yokai_desc?, yokai_image_b64? }
 *
 * The print daemon should be running with:
 *   python print_daemon.py --offline
 *   python print_daemon.py --both
 */

const LOCAL_DAEMON_URL = process.env.LOCAL_PRINT_URL || 'http://localhost:5555';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();

        if (!body.yokai_name) {
            return NextResponse.json(
                { error: 'yokai_name is required' },
                { status: 400 }
            );
        }

        const resp = await fetch(`${LOCAL_DAEMON_URL}/print`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });

        if (!resp.ok) {
            const err = await resp.json().catch(() => ({ error: 'Unknown error' }));
            return NextResponse.json(
                { error: 'Print daemon error', detail: err },
                { status: resp.status }
            );
        }

        const result = await resp.json();
        return NextResponse.json(result);
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        // Connection refused means the daemon is not running
        if (message.includes('ECONNREFUSED') || message.includes('fetch failed')) {
            return NextResponse.json(
                { error: 'Print daemon is not running. Start it with: python print_daemon.py --offline' },
                { status: 503 }
            );
        }
        return NextResponse.json(
            { error: 'Failed to contact print daemon', detail: message },
            { status: 500 }
        );
    }
}

export async function GET() {
    try {
        const resp = await fetch(`${LOCAL_DAEMON_URL}/health`);
        const data = await resp.json();
        return NextResponse.json(data);
    } catch {
        return NextResponse.json(
            { status: 'offline', message: 'Print daemon is not running' },
            { status: 503 }
        );
    }
}

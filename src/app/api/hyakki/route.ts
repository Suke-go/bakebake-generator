import { NextResponse } from 'next/server';
import { HyakkiInputError, hyakkiBuddies, hyakkiMeet, hyakkiMists, hyakkiPicture, hyakkiSilhouette, hyakkiSummon } from '@/lib/hyakki-server';

export const runtime = 'nodejs';

// Contract: src/lib/hyakki-types.ts. Nothing here logs or stores the pin; only errors are logged.
function fail(error: unknown) {
    if (error instanceof HyakkiInputError) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error('hyakki', error);
    return NextResponse.json({ error: 'Hyakki data unavailable' }, { status: 503 });
}

function image(bytes: Buffer | null, type: string) {
    return bytes
        ? new Response(new Uint8Array(bytes), { headers: { 'Content-Type': type, 'Cache-Control': 'public, max-age=604800, immutable' } })
        : NextResponse.json({ error: 'Picture not available' }, { status: 404 });
}

// GET ?region=&lat=&lon=   three companion cards (response is never cached: the URL holds the pin)
// GET ?silhouette=<mist id>  PNG
// GET ?picture=<token>       JPEG
export async function GET(request: Request) {
    try {
        const params = new URL(request.url).searchParams;
        const silhouette = params.get('silhouette'), picture = params.get('picture');
        if (silhouette !== null) return image(await hyakkiSilhouette(silhouette), 'image/png');
        if (picture !== null) return image(await hyakkiPicture(picture), 'image/jpeg');
        const lat = params.get('lat'), lon = params.get('lon');
        if (lat === null || lon === null || lat.trim() === '' || lon.trim() === '') throw new HyakkiInputError('Bad position');
        return NextResponse.json(await hyakkiBuddies(params.get('region'), Number(lat), Number(lon)), { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
        return fail(error);
    }
}

// POST { action: 'mists', region, chosen, shown } | { action: 'meet', id } | { action: 'summon', chosen }
export async function POST(request: Request) {
    try {
        const body = await request.json().catch(() => null) as Record<string, unknown> | null;
        if (!body || typeof body !== 'object') throw new HyakkiInputError('Invalid request');
        const headers = { 'Cache-Control': 'no-store' };
        switch (body.action) {
            case 'mists': return NextResponse.json(await hyakkiMists(body.region, body.chosen, body.shown), { headers });
            case 'meet': return NextResponse.json(await hyakkiMeet(body.id), { headers });
            case 'summon': return NextResponse.json(await hyakkiSummon(body.chosen), { headers });
            default: throw new HyakkiInputError('Unknown action');
        }
    } catch (error) {
        return fail(error);
    }
}

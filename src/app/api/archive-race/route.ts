import { NextResponse } from 'next/server';
import { raceLevels, raceLinks, raceReview } from '@/lib/archive-race-server';

export const runtime = 'nodejs';

// GET ?node=<index>&puzzle=<id>&done=<bits>  one story's links with shared words and landscape,
//                                 plus the puzzle's target when it is near (not linked), the moves
//                                 left from here and which links bring that number down
// GET                 levels and puzzles
export async function GET(request: Request) {
    try {
        const params = new URL(request.url).searchParams;
        const node = params.get('node');
        if (node !== null) {
            const data = await raceLinks(Number(node), params.get('puzzle'), Number(params.get('done') ?? 0));
            return data ? NextResponse.json(data, { headers: { 'Cache-Control': 'public, max-age=3600' } }) : NextResponse.json({ error: 'Unknown story' }, { status: 404 });
        }
        return NextResponse.json(await raceLevels(), { headers: { 'Cache-Control': 'public, max-age=300' } });
    } catch (error) {
        console.error('archive-race', error);
        return NextResponse.json({ error: 'Race data unavailable' }, { status: 503 });
    }
}

// POST { puzzleId, route: node indices in the order visited, back moves included }
export async function POST(request: Request) {
    try {
        const body = await request.json().catch(() => null) as { puzzleId?: unknown; route?: unknown } | null;
        if (!body || typeof body.puzzleId !== 'string') return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
        const review = await raceReview(body.puzzleId, body.route);
        return review ? NextResponse.json(review) : NextResponse.json({ error: 'Route does not follow the story links' }, { status: 400 });
    } catch (error) {
        console.error('archive-race review', error);
        return NextResponse.json({ error: 'Race data unavailable' }, { status: 503 });
    }
}

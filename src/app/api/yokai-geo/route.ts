import { NextResponse } from 'next/server';
import {
    getYokaiGeoFeatureCollection,
    normalizeYokaiGeoLimit,
    YokaiGeoDatasetNotFoundError,
} from '@/lib/yokai-geo';

export const runtime = 'nodejs';

function parseCsvParam(searchParams: URLSearchParams, name: string): string[] | undefined {
    const values = searchParams
        .getAll(name)
        .flatMap((value) => value.split(','))
        .map((value) => value.trim())
        .filter(Boolean);

    return values.length > 0 ? values : undefined;
}

function parseSummaryParam(searchParams: URLSearchParams): boolean {
    const value = searchParams.get('include_summary');
    if (!value) return true;
    return !['0', 'false', 'no', 'off'].includes(value.trim().toLowerCase());
}

function parseGeoLevelParam(searchParams: URLSearchParams): string[] | undefined {
    const values = parseCsvParam(searchParams, 'geo_level');
    return values ?? ['all'];
}

function parseLimit(searchParams: URLSearchParams): number | undefined {
    const value = searchParams.get('limit');
    if (!value) return undefined;

    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return undefined;

    return normalizeYokaiGeoLimit(parsed);
}

export async function GET(req: Request) {
    try {
        const url = new URL(req.url);
        const featureCollection = await getYokaiGeoFeatureCollection({
            category: parseCsvParam(url.searchParams, 'category'),
            geoLevel: parseGeoLevelParam(url.searchParams),
            terrainClass: parseCsvParam(url.searchParams, 'terrain_class'),
            limit: parseLimit(url.searchParams),
            includeSummary: parseSummaryParam(url.searchParams),
        });

        return NextResponse.json(featureCollection, {
            headers: {
                'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600',
            },
        });
    } catch (error) {
        if (error instanceof YokaiGeoDatasetNotFoundError) {
            return NextResponse.json(
                { error: 'Yokai geo dataset is not available' },
                { status: 503 },
            );
        }

        console.error('yokai-geo error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 },
        );
    }
}

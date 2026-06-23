import { promises as fs } from 'fs';
import path from 'path';

const DATASET_PATH = path.join(process.cwd(), 'data', 'nichibun', 'nichibun_enriched.json');
const DATASET_PUBLIC_ID = 'data/nichibun/nichibun_enriched.json';
const DEFAULT_LIMIT = 5000;
const MAX_LIMIT = 10000;

type JsonRecord = Record<string, unknown>;

export type YokaiGeoQuery = {
    category?: string[];
    geoLevel?: string[];
    terrainClass?: string[];
    limit?: number;
    includeSummary?: boolean;
};

export type GeoJsonPoint = {
    type: 'Point';
    coordinates: [number, number];
};

export type YokaiGeoFeature = {
    type: 'Feature';
    id?: string;
    geometry: GeoJsonPoint;
    properties: Record<string, string | number | boolean | null>;
};

export type YokaiGeoFeatureCollection = {
    type: 'FeatureCollection';
    features: YokaiGeoFeature[];
    metadata: {
        source_file: string;
        total_records: number;
        returned_features: number;
        limit: number;
        filters: {
            category: string[] | null;
            geo_level: string[] | null;
            terrain_class: string[] | null;
        };
        geo_level_counts: Record<string, number>;
        terrain_class_counts: Record<string, number>;
        coordinate_reference_system: 'EPSG:4326';
    };
};

export class YokaiGeoDatasetNotFoundError extends Error {
    constructor() {
        super(`Yokai geo dataset not found: ${DATASET_PATH}`);
        this.name = 'YokaiGeoDatasetNotFoundError';
    }
}

let cachedRecords: JsonRecord[] | null = null;
let loadingRecords: Promise<JsonRecord[]> | null = null;

function asRecord(value: unknown): JsonRecord | null {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
    return value as JsonRecord;
}

function asString(value: unknown): string | null {
    if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed.length > 0 ? trimmed : null;
    }
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    return null;
}

function asNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
        const parsed = Number(value.trim());
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
}

function firstString(record: JsonRecord, keys: string[]): string | null {
    const properties = asRecord(record.properties);
    for (const key of keys) {
        const value = asString(record[key] ?? properties?.[key]);
        if (value) return value;
    }
    return null;
}

function valueMatches(record: JsonRecord, keys: string[], accepted: Set<string> | null): boolean {
    if (!accepted || accepted.size === 0) return true;
    const properties = asRecord(record.properties);
    for (const key of keys) {
        const value = asString(record[key] ?? properties?.[key]);
        if (value && accepted.has(value)) return true;
    }
    return false;
}

function toSet(values?: string[]): Set<string> | null {
    if (!values || values.length === 0) return null;
    const normalized = values.map((value) => value.trim()).filter(Boolean);
    return normalized.length > 0 ? new Set(normalized) : null;
}

function countBy(records: JsonRecord[], keys: string[]): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const record of records) {
        const value = firstString(record, keys) ?? 'unknown';
        counts[value] = (counts[value] ?? 0) + 1;
    }
    return counts;
}

function getCoordinates(record: JsonRecord): [number, number] | null {
    const geometry = asRecord(record.geometry);
    const geometryCoordinates = geometry?.coordinates;
    if (geometry?.type === 'Point' && Array.isArray(geometryCoordinates) && geometryCoordinates.length >= 2) {
        const lon = asNumber(geometryCoordinates[0]);
        const lat = asNumber(geometryCoordinates[1]);
        if (lon !== null && lat !== null) return validateCoordinates(lon, lat);
    }

    const directLon = asNumber(record._lng ?? record.longitude ?? record.lon ?? record.lng);
    const directLat = asNumber(record._lat ?? record.latitude ?? record.lat);
    if (directLon !== null && directLat !== null) return validateCoordinates(directLon, directLat);

    const geo = asRecord(record.geo) ?? asRecord(record.geocode) ?? asRecord(record.location_geo);
    if (geo) {
        const lon = asNumber(geo.longitude ?? geo.lon ?? geo.lng);
        const lat = asNumber(geo.latitude ?? geo.lat);
        if (lon !== null && lat !== null) return validateCoordinates(lon, lat);
    }

    const coordinates = record.coordinates ?? record.coord;
    if (Array.isArray(coordinates) && coordinates.length >= 2) {
        const lon = asNumber(coordinates[0]);
        const lat = asNumber(coordinates[1]);
        if (lon !== null && lat !== null) return validateCoordinates(lon, lat);
    }

    return null;
}

function validateCoordinates(lon: number, lat: number): [number, number] | null {
    if (lon < -180 || lon > 180 || lat < -90 || lat > 90) return null;
    return [lon, lat];
}

function parseRecords(data: unknown): JsonRecord[] {
    if (Array.isArray(data)) return data.filter((item): item is JsonRecord => asRecord(item) !== null);

    const root = asRecord(data);
    const entries = root?.features ?? root?.entries ?? root?.records ?? root?.data;
    if (Array.isArray(entries)) return entries.filter((item): item is JsonRecord => asRecord(item) !== null);

    return [];
}

async function loadRecords(): Promise<JsonRecord[]> {
    if (cachedRecords) return cachedRecords;
    if (loadingRecords) return loadingRecords;

    loadingRecords = fs.readFile(DATASET_PATH, 'utf-8')
        .then((raw) => {
            const records = parseRecords(JSON.parse(raw));
            cachedRecords = records;
            return records;
        })
        .catch((error: unknown) => {
            loadingRecords = null;
            if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') {
                throw new YokaiGeoDatasetNotFoundError();
            }
            throw error;
        });

    return loadingRecords;
}

function toFeature(record: JsonRecord, includeSummary: boolean): YokaiGeoFeature | null {
    const coordinates = getCoordinates(record);
    if (!coordinates) return null;

    const id = firstString(record, ['id', 'record_id']);
    const majorCategory = firstString(record, ['major_category', 'category']);
    const geoLevel = firstString(record, ['_geo_level', 'geo_level', 'geoLevel']);
    const terrainClass = firstString(record, ['_terrain_class', 'terrain_class', 'terrainClass']);
    const summary = firstString(record, ['summary']);

    const properties: YokaiGeoFeature['properties'] = {
        id,
        name: firstString(record, ['name', 'name_kanji']),
        major_category: majorCategory,
        phenomenon: firstString(record, ['phenomenon']),
        geo_level: geoLevel,
        prefecture: firstString(record, ['prefecture']),
        admin2: firstString(record, ['_admin2', 'admin2']),
        geocoded_place: firstString(record, ['_geocoded_place', 'geocoded_place']),
        geocode_method: firstString(record, ['_geocode_method', 'geocode_method']),
        geocode_source: firstString(record, ['_geocode_source', 'geocode_source']),
        dist_water_km: asNumber(record._dist_water_km ?? record.dist_water_km),
        dist_coast_km: asNumber(record._dist_coast_km ?? record.dist_coast_km),
        terrain_class: terrainClass,
        terrain_coord_only: firstString(record, ['_terrain_coord_only', 'terrain_coord_only']),
        terrain_text_aware: firstString(record, ['_terrain_text_aware', 'terrain_text_aware']),
        pref_area_km2: asNumber(record._pref_area_km2 ?? record.pref_area_km2),
        pref_coastline_km_per_1000km2: asNumber(
            record._pref_coastline_km_per_1000km2 ?? record.pref_coastline_km_per_1000km2,
        ),
        pref_river_km_per_1000km2: asNumber(
            record._pref_river_km_per_1000km2 ?? record.pref_river_km_per_1000km2,
        ),
        pref_lake_area_pct: asNumber(record._pref_lake_area_pct ?? record.pref_lake_area_pct),
        admin2_area_km2: asNumber(record._admin2_area_km2 ?? record.admin2_area_km2),
        admin2_coastline_km_per_1000km2: asNumber(
            record._admin2_coastline_km_per_1000km2 ?? record.admin2_coastline_km_per_1000km2,
        ),
        admin2_river_km_per_1000km2: asNumber(
            record._admin2_river_km_per_1000km2 ?? record.admin2_river_km_per_1000km2,
        ),
        admin2_lake_area_pct: asNumber(record._admin2_lake_area_pct ?? record.admin2_lake_area_pct),
        river_source: firstString(record, ['_river_source', 'river_source']),
        lake_source: firstString(record, ['_lake_source', 'lake_source']),
        coastline_source: firstString(record, ['_coastline_source', 'coastline_source']),
    };

    if (includeSummary && summary) {
        properties.summary = summary.slice(0, 100);
    }

    return {
        type: 'Feature',
        ...(id ? { id } : {}),
        geometry: {
            type: 'Point',
            coordinates,
        },
        properties,
    };
}

export function normalizeYokaiGeoLimit(limit?: number): number {
    if (typeof limit !== 'number' || !Number.isFinite(limit)) return DEFAULT_LIMIT;
    return Math.min(Math.max(Math.trunc(limit), 0), MAX_LIMIT);
}

export async function getYokaiGeoFeatureCollection(
    query: YokaiGeoQuery = {},
): Promise<YokaiGeoFeatureCollection> {
    const records = await loadRecords();
    const categories = toSet(query.category);
    const geoLevels = query.geoLevel?.includes('all') ? null : toSet(query.geoLevel);
    const terrainClasses = toSet(query.terrainClass);
    const limit = normalizeYokaiGeoLimit(query.limit);
    const features: YokaiGeoFeature[] = [];
    const matchedRecords: JsonRecord[] = [];

    for (const record of records) {
        if (!valueMatches(record, ['major_category'], categories)) continue;
        if (!valueMatches(record, ['_geo_level', 'geo_level', 'geoLevel'], geoLevels)) continue;
        if (!valueMatches(record, ['_terrain_class', 'terrain_class', 'terrainClass'], terrainClasses)) continue;

        matchedRecords.push(record);
        if (features.length < limit) {
            const feature = toFeature(record, query.includeSummary === true);
            if (feature) {
                features.push(feature);
            }
        }
    }

    return {
        type: 'FeatureCollection',
        features,
        metadata: {
            source_file: DATASET_PUBLIC_ID,
            total_records: records.length,
            returned_features: features.length,
            limit,
            filters: {
                category: query.category ?? null,
                geo_level: query.geoLevel ?? null,
                terrain_class: query.terrainClass ?? null,
            },
            geo_level_counts: countBy(matchedRecords, ['_geo_level', 'geo_level', 'geoLevel']),
            terrain_class_counts: countBy(matchedRecords, ['_terrain_class', 'terrain_class', 'terrainClass']),
            coordinate_reference_system: 'EPSG:4326',
        },
    };
}

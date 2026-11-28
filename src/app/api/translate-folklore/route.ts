import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';
import { NextResponse } from 'next/server';
import { toErrorMessage, withExponentialBackoff } from '@/lib/genai-utils';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_RECORDS = 10;
const MAX_CONTENT_CHARS = 1200;
const CACHE_LIMIT = 2000;

export interface FolkloreTranslation {
    id: string;
    /** Hepburn romanization of the record's Japanese name. */
    reading: string;
    /** A short English rendering of the name. */
    gloss: string;
    /** English translation of the record's Japanese summary. */
    summary: string;
    /** The record's place in English, empty when none was given. */
    place: string;
}

type RecordInput = { id: string; kaiiName: string; content: string; location: string };

// Archive records do not change between visitors, so a translation made once
// serves every later English session on this server instance.
const translationCache = new Map<string, FolkloreTranslation>();

function cacheKey(record: RecordInput): string {
    return `${record.id}\u0000${record.kaiiName}\u0000${record.content}\u0000${record.location}`;
}

function remember(key: string, value: FolkloreTranslation) {
    if (translationCache.size >= CACHE_LIMIT) {
        const oldest = translationCache.keys().next().value;
        if (oldest !== undefined) translationCache.delete(oldest);
    }
    translationCache.set(key, value);
}

function buildPrompt(records: RecordInput[]): string {
    return [
        'You translate entries from a Japanese folklore archive (the Nichibunken Kaii-Yokai Folklore Database) for a visitor who cannot read Japanese.',
        'Return exactly one JSON object: {"translations":[{"id":string,"reading":string,"gloss":string,"summary":string,"place":string}, ...]} with one entry for every record below, in the same order.',
        '`id` is the id inside the brackets, without the brackets.',
        '`reading` is the record name romanized in Hepburn, words joined by hyphens where natural (e.g. "Kitsune-bi"). Romanize descriptive names too.',
        '`gloss` is a short English rendering of the name in one to five words (e.g. "fox fire"). Do not add an explanation.',
        '`summary` is a faithful English translation of the record text. Keep every place, person, time, and event it states. Add nothing, explain nothing, and neither soften nor dramatize. A Japanese term with no English equivalent stays in romanization with a brief gloss in parentheses the first time it appears.',
        '`place` renders the record\'s place in English (e.g. "Tono, Iwate Prefecture"), or is empty when the record gives none.',
        '',
        'Records (id, name, place, text):',
        ...records.map((record) => `- [${record.id}] ${record.kaiiName} / ${record.location || '-'}: ${record.content}`),
    ].join('\n');
}

async function callModel(prompt: string, signal: AbortSignal): Promise<string> {
    const geminiApiKeys = [process.env.GEMINI_API_KEY, process.env.GEMINI_SUB_API_KEY].filter(Boolean) as string[];
    for (const [index, apiKey] of geminiApiKeys.entries()) {
        const genAI = new GoogleGenAI({ apiKey });
        try {
            const result = await withExponentialBackoff(
                async () => {
                    const generated = await genAI.models.generateContent({
                        model: 'gemini-3.8-flash',
                        contents: prompt,
                        config: { responseMimeType: 'application/json' },
                    });
                    if (!generated?.text) throw new Error('Empty response from Gemini');
                    return generated;
                },
                'translate-folklore',
                2,
                400,
                () => signal.aborted,
            );
            if (result.text) return result.text;
        } catch (error) {
            console.warn(`translate-folklore: Gemini (Key ${index + 1}) call failed:`, toErrorMessage(error));
        }
    }
    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) return '';
    try {
        const openai = new OpenAI({ apiKey: openaiApiKey });
        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                { role: 'system', content: 'You are a careful translator of Japanese folklore records returning JSON output.' },
                { role: 'user', content: prompt },
            ],
            response_format: { type: 'json_object' },
        });
        return response.choices[0]?.message?.content || '';
    } catch (error) {
        console.warn('translate-folklore: OpenAI fallback failed:', toErrorMessage(error));
        return '';
    }
}

function parseTranslations(text: string, permitted: Set<string>): FolkloreTranslation[] {
    try {
        const parsed = JSON.parse(text) as { translations?: unknown };
        const items = Array.isArray(parsed.translations) ? parsed.translations : [];
        return items.flatMap((item): FolkloreTranslation[] => {
            if (!item || typeof item !== 'object') return [];
            const value = item as Record<string, unknown>;
            const id = typeof value.id === 'string' ? value.id.trim().replace(/^\[|\]$/g, '').trim() : '';
            const summary = typeof value.summary === 'string' ? value.summary.trim() : '';
            if (!permitted.has(id) || !summary) return [];
            return [{
                id,
                reading: typeof value.reading === 'string' ? value.reading.trim() : '',
                gloss: typeof value.gloss === 'string' ? value.gloss.trim() : '',
                summary,
                place: typeof value.place === 'string' ? value.place.trim() : '',
            }];
        });
    } catch {
        console.warn('translate-folklore: failed to parse model response');
        return [];
    }
}

export async function POST(req: Request) {
    let payload: unknown;
    try {
        payload = await req.json();
    } catch {
        return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 });
    }
    const rawRecords = (payload as { records?: unknown })?.records;
    if (!Array.isArray(rawRecords) || rawRecords.length === 0) {
        return NextResponse.json({ error: 'records are required' }, { status: 400 });
    }
    const records: RecordInput[] = rawRecords.slice(0, MAX_RECORDS).flatMap((item): RecordInput[] => {
        if (!item || typeof item !== 'object') return [];
        const value = item as Record<string, unknown>;
        if (typeof value.id !== 'string' || typeof value.kaiiName !== 'string' || typeof value.content !== 'string') return [];
        return [{ id: value.id, kaiiName: value.kaiiName.slice(0, 120), content: value.content.slice(0, MAX_CONTENT_CHARS), location: typeof value.location === 'string' ? value.location.slice(0, 120) : '' }];
    });
    if (records.length === 0) return NextResponse.json({ error: 'records are required' }, { status: 400 });

    const cached: FolkloreTranslation[] = [];
    const missing: RecordInput[] = [];
    for (const record of records) {
        const hit = translationCache.get(cacheKey(record));
        if (hit) cached.push(hit); else missing.push(record);
    }

    if (missing.length === 0) {
        return NextResponse.json({ translations: cached, usedModel: 'cache' }, { headers: { 'x-paid-api-calls': '0' } });
    }
    if (!process.env.GEMINI_API_KEY && !process.env.GEMINI_SUB_API_KEY && !process.env.OPENAI_API_KEY) {
        return NextResponse.json({ translations: cached, usedModel: 'unconfigured' });
    }

    const responseText = await callModel(buildPrompt(missing), req.signal);
    const fresh = responseText ? parseTranslations(responseText, new Set(missing.map((record) => record.id))) : [];
    for (const translation of fresh) {
        const record = missing.find((item) => item.id === translation.id);
        if (record) remember(cacheKey(record), translation);
    }
    const byId = new Map([...cached, ...fresh].map((item) => [item.id, item]));
    return NextResponse.json({
        translations: records.flatMap((record) => byId.get(record.id) ?? []),
        usedModel: fresh.length > 0 ? 'generated' : 'failed',
    });
}

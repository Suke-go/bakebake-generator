import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';
import { NextResponse } from 'next/server';
import { buildEventAppraisalPrompt, buildSearchQuery, type HandleInfo, type UserAnswers } from '@/lib/prompt-builder';
import { getStatusCode, toErrorMessage, withExponentialBackoff } from '@/lib/genai-utils';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_RETRY_ATTEMPTS = 3;
const INITIAL_RETRY_DELAY_MS = 400;
const RATE_LIMIT_COOLDOWN_MS = 45_000;

let nextRequestAllowedAt = 0;

function isRateLimitError(error: unknown): boolean {
    const status = getStatusCode(error);
    const message = toErrorMessage(error).toLowerCase();
    return status === 429 || message.includes('resource exhausted') || message.includes('quota') || message.includes('rate limit');
}

export interface EventStatement { text: string }
export interface AppraisalCandidate {
    id: string;
    text: string;
    sourceSpan: string;
    basis: 'grounded' | 'interpretation';
    /** false if sourceSpan did not appear verbatim in the account; such candidates are dropped, not just flagged. */
    verified: true;
}

function placeholderResponse(reason: 'paid-api-paused' | 'rate-limit-fallback', startedAt: number) {
    const event: EventStatement = { text: '' };
    return NextResponse.json(
        { event, appraisals: [] as AppraisalCandidate[], usedModel: reason },
        {
            headers: {
                'x-paid-api-calls': '0',
                'x-generate-event-appraisal-duration-ms': `${Date.now() - startedAt}`,
                ...(reason === 'rate-limit-fallback' ? { 'x-generate-event-appraisal-rate-limit': 'cooldown' } : {}),
            },
        },
    );
}

export async function POST(req: Request) {
    try {
        const startedAt = Date.now();
        let bodyText: string;
        try {
            bodyText = await req.text();
        } catch {
            return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
        }
        if (!bodyText.trim()) return NextResponse.json({ error: 'Request body is empty' }, { status: 400 });

        let payload: unknown;
        try {
            payload = JSON.parse(bodyText);
        } catch {
            return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 });
        }

        const { answers, handle, locale: requestedLocale } = payload as {
            answers?: UserAnswers;
            handle?: HandleInfo;
            locale?: 'ja' | 'en';
        };
        const validAnswers = typeof answers === 'object' && answers !== null;
        const validHandle = handle && typeof handle.id === 'string' && typeof handle.text === 'string';
        if (!validAnswers || !validHandle) {
            return NextResponse.json({ error: 'answers and handle are required' }, { status: 400 });
        }
        const locale = requestedLocale === 'en' ? 'en' : 'ja';

        if (process.env.PAID_GENERATION_ENABLED !== 'true') return placeholderResponse('paid-api-paused', startedAt);

        const geminiApiKey = process.env.GEMINI_API_KEY;
        const openaiApiKey = process.env.OPENAI_API_KEY;
        if (!geminiApiKey && !openaiApiKey) return NextResponse.json({ error: 'API Keys not configured' }, { status: 500 });

        if (Date.now() < nextRequestAllowedAt) return placeholderResponse('rate-limit-fallback', startedAt);

        // The account, verbatim, is what every sourceSpan must be checked against —
        // built the same way the search query is, so "the account" means the same
        // concatenation everywhere in the app.
        const account = buildSearchQuery(handle, answers);
        const prompt = buildEventAppraisalPrompt(handle, answers, locale);

        let responseText = '';
        let geminiFailed = true;
        let usedModel = '';
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
                    'generate-event-appraisal',
                    MAX_RETRY_ATTEMPTS,
                    INITIAL_RETRY_DELAY_MS,
                    (error) => {
                        if (req.signal.aborted) return true;
                        if (isRateLimitError(error)) {
                            nextRequestAllowedAt = Date.now() + RATE_LIMIT_COOLDOWN_MS;
                            return true;
                        }
                        return false;
                    },
                );
                responseText = result.text || '';
                geminiFailed = false;
                usedModel = 'gemini-3.8-flash';
                nextRequestAllowedAt = 0;
                break;
            } catch (error) {
                console.warn(`generate-event-appraisal: Gemini (Key ${index + 1}) call failed:`, toErrorMessage(error));
            }
        }

        if (geminiFailed && openaiApiKey) {
            console.log('generate-event-appraisal: Falling back to OpenAI API...');
            try {
                const openai = new OpenAI({ apiKey: openaiApiKey });
                const openaiResponse = await openai.chat.completions.create({
                    model: 'gpt-4o-mini',
                    messages: [
                        { role: 'system', content: 'You read personal accounts and produce structured JSON output. You never invent a cause the writer did not state.' },
                        { role: 'user', content: prompt },
                    ],
                    response_format: { type: 'json_object' },
                });
                responseText = openaiResponse.choices[0]?.message?.content || '';
                if (responseText) usedModel = 'gpt-4o-mini';
            } catch (error) {
                console.warn('generate-event-appraisal: OpenAI fallback failed:', toErrorMessage(error));
            }
        }

        let event: EventStatement = { text: '' };
        const appraisals: AppraisalCandidate[] = [];
        let droppedUnverified = 0;

        if (responseText) {
            try {
                const parsed = JSON.parse(responseText) as {
                    event?: { text?: unknown };
                    appraisals?: unknown;
                };
                if (parsed.event && typeof parsed.event.text === 'string') {
                    event = { text: parsed.event.text.trim() };
                }
                const rawAppraisals = Array.isArray(parsed.appraisals) ? parsed.appraisals : [];
                rawAppraisals.forEach((item, index) => {
                    if (!item || typeof item !== 'object') return;
                    const candidate = item as Record<string, unknown>;
                    const text = typeof candidate.text === 'string' ? candidate.text.trim() : '';
                    const sourceSpan = typeof candidate.sourceSpan === 'string' ? candidate.sourceSpan.trim() : '';
                    const basis = candidate.basis === 'grounded' ? 'grounded' : 'interpretation';
                    if (!text || !sourceSpan) return;
                    // Verify verbatim before the candidate ever reaches a participant —
                    // per the paper, this check confirms the quoted span exists in the
                    // input, not that the candidate's reading of it is faithful.
                    if (!account.includes(sourceSpan)) {
                        droppedUnverified += 1;
                        return;
                    }
                    appraisals.push({ id: `a${index + 1}`, text, sourceSpan, basis, verified: true });
                });
            } catch {
                console.warn('generate-event-appraisal: failed to parse LLM response:', responseText);
            }
        }

        if (!event.text || appraisals.length === 0) {
            usedModel = usedModel || 'fallback';
        }

        return NextResponse.json(
            { event, appraisals, usedModel, ...(droppedUnverified > 0 ? { droppedUnverified } : {}) },
            { headers: { 'x-generate-event-appraisal-duration-ms': `${Date.now() - startedAt}` } },
        );
    } catch (error) {
        console.error('generate-event-appraisal error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

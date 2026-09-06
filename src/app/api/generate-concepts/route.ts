import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';
import { NextResponse } from 'next/server';
import { buildConceptPrompt } from '@/lib/prompt-builder';
import { getStatusCode, toErrorMessage, withExponentialBackoff } from '@/lib/genai-utils';

const MAX_RETRY_ATTEMPTS = 3;
const INITIAL_RETRY_DELAY_MS = 400;
const RATE_LIMIT_COOLDOWN_MS = 45_000;

let nextRequestAllowedAt = 0;

function isRateLimitError(error: unknown): boolean {
    const status = getStatusCode(error);
    const message = toErrorMessage(error).toLowerCase();
    return status === 429 || message.includes('resource exhausted') || message.includes('quota') || message.includes('rate limit');
}

export async function POST(req: Request) {
    try {
        const startedAt = Date.now();
        let bodyText: string;
        try {
            bodyText = await req.text();
        } catch {
            return NextResponse.json(
                { error: 'Invalid request body' },
                { status: 400 }
            );
        }

        if (!bodyText.trim()) {
            return NextResponse.json(
                { error: 'Request body is empty' },
                { status: 400 }
            );
        }

        let payload: unknown;
        try {
            payload = JSON.parse(bodyText);
        } catch {
            return NextResponse.json(
                { error: 'Request body must be valid JSON' },
                { status: 400 }
            );
        }

        const { folklore, answers, handle, locale: requestedLocale } = payload as {
            folklore?: unknown;
            answers?: unknown;
            handle?: {
                id: string;
                text: string;
            };
            locale?: 'ja' | 'en';
        };

        const validAnswers = typeof answers === 'object' && answers !== null;
        const validHandle = handle && typeof handle.id === 'string' && typeof handle.text === 'string';

        if (!folklore || !validAnswers || !validHandle) {
            return NextResponse.json(
                { error: 'folklore, answers, and handle are required' },
                { status: 400 }
            );
        }

        const geminiApiKey = process.env.GEMINI_API_KEY;
        const openaiApiKey = process.env.OPENAI_API_KEY;
        if (!geminiApiKey && !openaiApiKey) {
            return NextResponse.json(
                { error: 'API Keys not configured' },
                { status: 500 }
            );
        }

        const conceptInput = Array.isArray(folklore) ? folklore.slice(0, 3) : [];
        const dbConcepts = conceptInput.slice(0, 2).map((f: {
            kaiiName: string;
            content: string;
            id: string;
        }) => ({
            source: 'db' as const,
            name: f.kaiiName,
            reading: '',
            description: f.content,
            label: 'database',
            folkloreRef: f.id,
        }));

        if (Date.now() < nextRequestAllowedAt) {
            return NextResponse.json(
                {
                    concepts: [
                        ...dbConcepts,
                        {
                            source: 'llm' as const,
                            name: '仮の妖怪',
                            reading: '',
                            description: '概念生成サービスが一時的に混雑しています。代替モードで表示しています。',
                            label: 'rate-limit-fallback',
                        },
                    ],
                },
                {
                    headers: {
                        'x-generate-concepts-rate-limit': 'cooldown',
                        'x-generate-concepts-duration-ms': `${Date.now() - startedAt}`,
                    },
                }
            );
        }

        const conceptAnswers = answers as Record<string, string>;
        const locale = requestedLocale === 'en' ? 'en' : 'ja';
        const prompt = buildConceptPrompt(handle, conceptAnswers, conceptInput, locale);
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
                            model: 'gemini-2.0-flash',
                            contents: prompt,
                            config: {
                                responseMimeType: 'application/json',
                            }
                        });
                        if (!generated?.text) {
                            throw new Error('Empty response from Gemini');
                        }
                        return generated;
                    },
                    'generate-concepts',
                    MAX_RETRY_ATTEMPTS,
                    INITIAL_RETRY_DELAY_MS,
                    (error) => {
                        if (req.signal.aborted) return true;
                        if (isRateLimitError(error)) {
                            nextRequestAllowedAt = Date.now() + RATE_LIMIT_COOLDOWN_MS;
                            return true;
                        }
                        return false;
                    }
                );
                responseText = result.text || '';
                geminiFailed = false;
                usedModel = 'gemini-2.0-flash';
                nextRequestAllowedAt = 0; // Reset global rate limit if this key succeeded
                break;
            } catch (error) {
                console.warn(`generate-concepts: Gemini (Key ${index + 1}) call failed:`, toErrorMessage(error));
                // Will naturally loop to next key if available
            }
        }

        if (geminiFailed && openaiApiKey) {
            console.log('generate-concepts: Falling back to OpenAI API...');
            try {
                const openai = new OpenAI({ apiKey: openaiApiKey });
                const openaiResponse = await openai.chat.completions.create({
                    model: 'gpt-4o-mini',
                    messages: [
                        { role: 'system', content: 'You are an expert folklorist AI returning JSON output.' },
                        { role: 'user', content: prompt }
                    ],
                });
                responseText = openaiResponse.choices[0]?.message?.content || '';
                if (responseText) usedModel = 'gpt-4o-mini';
            } catch (error) {
                console.warn('generate-concepts: OpenAI fallback failed:', toErrorMessage(error));
            }
        }

        let llmCandidates: Array<{
            source: 'llm';
            name: string;
            reading: string;
            description: string;
            label: string;
            namingType: string;
        }> = [];
        let folkloreSummaries: Array<{ folkloreRef: string; summary: string }> = [];

        if (responseText) {
            try {
                const parsed = JSON.parse(responseText);
                const conceptItems = Array.isArray(parsed)
                    ? parsed
                    : Array.isArray(parsed?.concepts)
                        ? parsed.concepts
                        : [];
                if (conceptItems.length > 0) {
                    llmCandidates = conceptItems.map((item: unknown) => {
                        const candidate = item && typeof item === 'object' ? item as Record<string, unknown> : {};
                        return {
                            source: 'llm' as const,
                            name: typeof candidate.name === 'string' ? candidate.name : '名無し',
                            reading: typeof candidate.reading === 'string' ? candidate.reading : '',
                            description: typeof candidate.description === 'string' ? candidate.description : '',
                            label: 'llm-generated',
                            namingType: typeof candidate.type === 'string' ? candidate.type : 'unknown',
                        };
                    });
                }
                if (locale === 'en' && Array.isArray(parsed?.folkloreSummaries)) {
                    const permittedIds = new Set<string>(conceptInput
                        .map((item: { id?: string }) => item.id)
                        .filter((id): id is string => typeof id === 'string'));
                    folkloreSummaries = (parsed.folkloreSummaries as unknown[])
                        .filter((item: unknown): item is { folkloreRef: string; summary: string } =>
                            Boolean(item) && typeof item === 'object' && typeof (item as { folkloreRef?: unknown }).folkloreRef === 'string' && typeof (item as { summary?: unknown }).summary === 'string')
                        .filter((item) => permittedIds.has(item.folkloreRef) && item.summary.trim().length > 0)
                        .map((item) => ({ folkloreRef: item.folkloreRef, summary: item.summary.trim() }));
                }
                // Fallback: try single object
                if (llmCandidates.length === 0) {
                    const objMatch = responseText.match(/\{[\s\S]*\}/);
                    if (objMatch) {
                        const parsed = JSON.parse(objMatch[0]);
                        llmCandidates = [{
                            source: 'llm' as const,
                            name: parsed.name || '名無し',
                            reading: parsed.reading || '',
                            description: parsed.description || '',
                            label: 'llm-generated',
                            namingType: parsed.type || 'place_action',
                        }];
                    }
                }
            } catch {
                console.warn('Failed to parse LLM concepts:', responseText);
            }
        }

        if (llmCandidates.length === 0) {
            usedModel = usedModel || 'fallback';
            llmCandidates = [{
                source: 'llm' as const,
                name: '気配',
                reading: 'けはい',
                description: 'LLMの応答を取得できませんでした。',
                label: 'fallback',
                namingType: 'fallback',
            }];
        }

        return NextResponse.json(
            {
                concepts: [...dbConcepts, ...llmCandidates],
                usedModel,
                ...(folkloreSummaries.length > 0 ? { folkloreSummaries } : {}),
            },
            {
                headers: {
                    'x-generate-concepts-duration-ms': `${Date.now() - startedAt}`,
                },
            }
        );
    } catch (error) {
        console.error('generate-concepts error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}


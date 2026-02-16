import { GoogleGenAI, Modality, type GenerateContentResponse } from '@google/genai';
import { NextResponse } from 'next/server';
import { getStylePrompt } from '@/lib/art-styles';
import { buildImagePrompt, buildNarrativePrompt } from '@/lib/prompt-builder';
import {
    getRetryDelayMs,
    getStatusCode,
    toErrorMessage,
    withExponentialBackoff,
} from '@/lib/genai-utils';

const IMAGE_MODEL_CANDIDATES = [
    'gemini-2.5-flash-image',
    'gemini-3-pro-image-preview',
] as const;
const TEXT_MODEL = 'gemini-2.5-flash';
const IMAGE_CONFIG = {
    aspectRatio: '1:1' as const,
    imageSize: '2K' as const,
};
const IMAGE_RESPONSE_MODALITIES: Modality[] = [Modality.IMAGE];
const GENERATION_MODELS = IMAGE_MODEL_CANDIDATES;
const MAX_RETRY_ATTEMPTS = 3;
const INITIAL_RETRY_DELAY_MS = 400;
const RATE_LIMIT_COOLDOWN_MS = 45_000;
const IMAGE_CACHE_TTL_MS = 60_000;
const IMAGE_CACHE_KEY_SEPARATOR = '||';

let imageRequestAllowedAt = 0;

type CandidatePart = {
    inlineData?: {
        data?: string;
        mimeType?: string;
    };
};

type GenerationCandidate = {
    content?: {
        parts?: CandidatePart[];
    };
};

type GenerationResponse = {
    response?: {
        candidates?: GenerationCandidate[];
    };
    candidates?: GenerationCandidate[];
};

type ImageGenerationResponse = GenerateContentResponse;

type ImageApiResponse = {
    imageBase64: string;
    imageMimeType: string;
    narrative: string;
    warnings: string[];
    usedModel?: string;
};

type ConceptPayload = {
    name: string;
    reading: string;
    description: string;
};

type ImageRequestState = {
    value: ImageApiResponse;
    expiresAt: number;
};

const imageRequestCache = new Map<string, ImageRequestState>();
const imageRequestInFlight = new Map<string, Promise<ImageApiResponse>>();

function isRateLimitError(error: unknown): boolean {
    const status = getStatusCode(error);
    const message = toErrorMessage(error).toLowerCase();
    return (
        status === 429 ||
        message.includes('resource exhausted') ||
        message.includes('quota') ||
        message.includes('rate limit')
    );
}

function getImageCache(key: string): ImageApiResponse | null {
    const entry = imageRequestCache.get(key);
    if (!entry) return null;
    if (entry.expiresAt < Date.now()) {
        imageRequestCache.delete(key);
        return null;
    }
    return entry.value;
}

function setImageCache(key: string, value: ImageApiResponse) {
    imageRequestCache.set(key, {
        value,
        expiresAt: Date.now() + IMAGE_CACHE_TTL_MS,
    });
}

function buildImageRequestKey(
    concept: { name: string; reading: string; description: string },
    artStyle: string | null,
    visualInput: string,
    answers: Record<string, string>
): string {
    const sortedAnswerKeys = Object.keys(answers).sort();
    const answerSig = sortedAnswerKeys
        .map((key) => `${key}:${answers[key] ?? ''}`)
        .join(IMAGE_CACHE_KEY_SEPARATOR);

    return `${concept.name}${IMAGE_CACHE_KEY_SEPARATOR}${concept.reading}${IMAGE_CACHE_KEY_SEPARATOR}${concept.description}${IMAGE_CACHE_KEY_SEPARATOR}${artStyle ?? ''}${IMAGE_CACHE_KEY_SEPARATOR}${answerSig}${IMAGE_CACHE_KEY_SEPARATOR}${visualInput}`;
}

function getImageFromResponse(
    result: GenerationResponse
): { base64: string; mimeType: string } | null {
    const candidates = result?.candidates ?? result?.response?.candidates ?? [];

    for (const candidate of candidates) {
        const parts = candidate?.content?.parts ?? [];
        for (const part of parts) {
            const inlineData = part?.inlineData;
            if (inlineData?.data) {
                return {
                    base64: inlineData.data,
                    mimeType: inlineData.mimeType || 'image/png',
                };
            }
        }
    }
    return null;
}

function getImagePromptConfig(
    model: string,
    imagePrompt: string
): {
    contents: Array<{ text: string }>;
    config: {
        responseModalities: typeof IMAGE_RESPONSE_MODALITIES;
        imageConfig: {
            aspectRatio: typeof IMAGE_CONFIG.aspectRatio;
            imageSize?: typeof IMAGE_CONFIG.imageSize;
        };
    };
} {
    const imageConfig = model.includes('3-pro')
        ? IMAGE_CONFIG
        : { aspectRatio: IMAGE_CONFIG.aspectRatio };

    return {
        contents: [{ text: imagePrompt }],
        config: {
            responseModalities: IMAGE_RESPONSE_MODALITIES,
            imageConfig,
        },
    };
}

async function generateImageWithFallback(
    genAI: GoogleGenAI,
    imagePrompt: string
): Promise<{ base64: string; mimeType: string; usedModel: string }> {
    const warnings: string[] = [];
    const lastError = new Error('Image generation unavailable');

    for (const model of GENERATION_MODELS) {
        try {
            const result = await withExponentialBackoff<ImageGenerationResponse>(() => {
                const request = getImagePromptConfig(model, imagePrompt);
                return genAI.models.generateContent({
                    model,
                    contents: request.contents,
                    config: request.config,
                }) as Promise<ImageGenerationResponse>;
            }, model, MAX_RETRY_ATTEMPTS, INITIAL_RETRY_DELAY_MS, (error) => {
                if (isRateLimitError(error)) {
                    imageRequestAllowedAt = Date.now() + (getRetryDelayMs(error) ?? RATE_LIMIT_COOLDOWN_MS);
                    return true;
                }
                return false;
            });

            const image = getImageFromResponse(result);
            if (image) {
                return { ...image, usedModel: model };
            }
            warnings.push(`${model}: no inline image in response`);
        } catch (error) {
            if (isRateLimitError(error)) {
                throw error;
            }
            warnings.push(`${model}: ${toErrorMessage(error)}`);
            if (model === GENERATION_MODELS[GENERATION_MODELS.length - 1]) {
                lastError.message = warnings.join('; ');
            }
        }
    }

    throw lastError;
}

async function generateNarrativeWithFallback(
    genAI: GoogleGenAI,
    narrativePrompt: string
): Promise<string> {
    try {
        const narrativeResult = await withExponentialBackoff<ImageGenerationResponse>(() => {
            return genAI.models.generateContent({
                model: TEXT_MODEL,
                contents: narrativePrompt,
            }) as Promise<ImageGenerationResponse>;
        }, TEXT_MODEL, MAX_RETRY_ATTEMPTS, INITIAL_RETRY_DELAY_MS, (error) => {
            if (isRateLimitError(error)) {
                imageRequestAllowedAt = Date.now() + (getRetryDelayMs(error) ?? RATE_LIMIT_COOLDOWN_MS);
                return true;
            }
            return false;
        });

        return narrativeResult.text || '';
    } catch {
        return '';
    }
}

function buildRateLimitResponse(): ImageApiResponse {
    return {
        imageBase64: '',
        imageMimeType: 'image/png',
        narrative: 'Image generation is temporarily paused due to service quota, using fallback mode.',
        warnings: ['Rate limit cooldown active; using fallback mode.'],
    };
}

function getRateLimitState(): 'active' | 'inactive' {
    return Date.now() < imageRequestAllowedAt ? 'active' : 'inactive';
}

export const maxDuration = 120;

export async function POST(req: Request) {
    const startedAt = Date.now();

    try {
        let rawBody: string;
        try {
            rawBody = await req.text();
        } catch {
            return NextResponse.json(
                { error: 'Invalid request body' },
                { status: 400 }
            );
        }

        if (!rawBody.trim()) {
            return NextResponse.json(
                { error: 'Request body is empty' },
                { status: 400 }
            );
        }

        let body: {
            concept?: unknown;
            artStyle?: string | null;
            visualInput?: string;
            answers?: Record<string, string>;
        };
        try {
            body = JSON.parse(rawBody);
        } catch {
            return NextResponse.json(
                { error: 'Request body must be valid JSON' },
                { status: 400 }
            );
        }

        const {
            concept: rawConcept,
            artStyle = null,
            visualInput = '',
            answers = {},
        } = body;
        const concept = rawConcept as ConceptPayload | undefined;
        const answerMap = answers;

        const isValidAnswers =
            typeof answerMap === 'object' &&
            answerMap !== null;

        if (!concept || typeof concept !== 'object' || !isValidAnswers) {
            return NextResponse.json({ error: 'concept and answers are required' }, { status: 400 });
        }
        if (
            typeof concept.name !== 'string' ||
            typeof concept.reading !== 'string' ||
            typeof concept.description !== 'string'
        ) {
            return NextResponse.json({ error: 'concept fields are invalid' }, { status: 400 });
        }
        if (typeof visualInput !== 'string') {
            return NextResponse.json({ error: 'visualInput must be a string' }, { status: 400 });
        }

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return NextResponse.json(
                { error: 'GEMINI_API_KEY not configured' },
                { status: 500 }
            );
        }

        const requestKey = buildImageRequestKey(concept, artStyle, visualInput, answerMap as Record<string, string>);
        const cached = getImageCache(requestKey);
        if (cached) {
            return NextResponse.json(cached, {
                headers: {
                    'x-generate-image-cache': 'hit',
                    'x-generate-image-duration-ms': `${Date.now() - startedAt}`,
                    'x-generate-image-rate-limit': getRateLimitState(),
                },
            });
        }

        const inFlight = imageRequestInFlight.get(requestKey);
        if (inFlight) {
            const result = await inFlight;
            return NextResponse.json(result, {
                headers: {
                    'x-generate-image-cache': 'in-flight',
                    'x-generate-image-duration-ms': `${Date.now() - startedAt}`,
                    'x-generate-image-rate-limit': getRateLimitState(),
                },
            });
        }

        const requestPromise = (async (): Promise<ImageApiResponse> => {
            if (Date.now() < imageRequestAllowedAt) {
                return buildRateLimitResponse();
            }

        const genAI = new GoogleGenAI({ apiKey });
        const stylePrompt = getStylePrompt(artStyle);
        const imagePromptText = buildImagePrompt(concept, stylePrompt, visualInput);
        const narrativePrompt = buildNarrativePrompt(concept, answerMap as Record<string, string>);
        const warnings: string[] = [];

            const imageResultPromise = generateImageWithFallback(genAI, imagePromptText).catch((error: unknown) => {
                warnings.push(`Image generation: ${toErrorMessage(error)}`);
                throw error;
            });
            const narrativeResultPromise = generateNarrativeWithFallback(genAI, narrativePrompt).catch((error: unknown) => {
                warnings.push(`Narrative generation: ${toErrorMessage(error)}`);
                return '';
            });

            const [imageResultState, narrativeTextState] = await Promise.allSettled([imageResultPromise, narrativeResultPromise]);
            const narrativeText =
                narrativeTextState.status === 'fulfilled' && narrativeTextState.value
                    ? narrativeTextState.value
                    : 'Could not generate narrative.';

            if (imageResultState.status === 'rejected') {
                if (isRateLimitError(imageResultState.reason)) {
                    return buildRateLimitResponse();
                }
                return {
                    imageBase64: '',
                    imageMimeType: 'image/png',
                    narrative: narrativeText,
                    warnings,
                };
            }

            const imageResult = imageResultState.value;

            if (!imageResult) {
                warnings.push('No image generated by model; returning fallback text-only response.');
                return {
                    imageBase64: '',
                    imageMimeType: 'image/png',
                    narrative: narrativeText,
                    warnings,
                };
            }

            return {
                imageBase64: imageResult.base64,
                imageMimeType: imageResult.mimeType,
                narrative: narrativeText,
                warnings,
                usedModel: imageResult.usedModel,
            };
        })();

        imageRequestInFlight.set(requestKey, requestPromise);
        try {
            const result = await requestPromise;
            setImageCache(requestKey, result);
            return NextResponse.json(result, {
                headers: {
                    'x-generate-image-cache': 'miss',
                    'x-generate-image-duration-ms': `${Date.now() - startedAt}`,
                    'x-generate-image-rate-limit': getRateLimitState(),
                },
            });
        } finally {
            if (imageRequestInFlight.get(requestKey) === requestPromise) {
                imageRequestInFlight.delete(requestKey);
            }
        }
    } catch (error) {
        const fallback = getStatusCode(error);
        console.error('generate-image error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            {
                status: 500,
                headers: {
                    ...(fallback === 429 ? { 'x-generate-image-rate-limit': 'active' } : {}),
                    'x-generate-image-duration-ms': `${Date.now() - startedAt}`,
                },
            }
        );
    }
}

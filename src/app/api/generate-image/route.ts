import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextResponse } from 'next/server';
import { getStylePrompt } from '@/lib/art-styles';
import { buildImagePrompt, buildNarrativePrompt } from '@/lib/prompt-builder';

// Fluid Compute: 画像生成は時間がかかるので長めに設定
export const maxDuration = 120;

export async function POST(req: Request) {
    try {
        const { concept, artStyle, visualInput, answers } = await req.json();

        if (!concept) {
            return NextResponse.json(
                { error: 'concept is required' },
                { status: 400 }
            );
        }

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return NextResponse.json(
                { error: 'GEMINI_API_KEY not configured' },
                { status: 500 }
            );
        }

        const genAI = new GoogleGenerativeAI(apiKey);

        // 1. 画像生成
        const stylePrompt = getStylePrompt(artStyle);
        const imagePromptText = buildImagePrompt(concept, stylePrompt, visualInput);

        const imgModel = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
        const imageResult = await imgModel.generateContent({
            contents: [{
                role: 'user',
                parts: [{ text: imagePromptText }],
            }],
            generationConfig: {
                // @ts-expect-error - Gemini image gen uses responseModalities
                responseModalities: ['IMAGE', 'TEXT'],
            },
        });

        // 画像データを抽出
        let imageBase64 = '';
        let imageMimeType = 'image/png';

        const candidates = imageResult.response.candidates;
        if (candidates && candidates[0]?.content?.parts) {
            for (const part of candidates[0].content.parts) {
                const inlineData = (part as { inlineData?: { data?: string; mimeType?: string } }).inlineData;
                if (inlineData?.data) {
                    imageBase64 = inlineData.data;
                    imageMimeType = inlineData.mimeType || 'image/png';
                    break;
                }
            }
        }

        if (!imageBase64) {
            return NextResponse.json(
                { error: 'Image generation produced no image content' },
                { status: 500 }
            );
        }

        // 2. ナラティブ生成（並行して実行可能だが、逐次で安全に）
        const textModel = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
        const narrativePrompt = buildNarrativePrompt(concept, answers || {});
        const narrativeResult = await textModel.generateContent(narrativePrompt);
        const narrative = narrativeResult.response.text();

        return NextResponse.json({
            imageBase64,
            imageMimeType,
            narrative,
        });
    } catch (error) {
        console.error('generate-image error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}

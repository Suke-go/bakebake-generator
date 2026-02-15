import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextResponse } from 'next/server';
import { buildConceptPrompt } from '@/lib/prompt-builder';

export async function POST(req: Request) {
    try {
        const { folklore, answers, handle } = await req.json();

        if (!folklore || !answers || !handle) {
            return NextResponse.json(
                { error: 'folklore, answers, and handle are required' },
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

        // 1. DB由来の概念（folklore結果の上位2件から）
        const dbConcepts = folklore.slice(0, 2).map((f: {
            kaiiName: string;
            content: string;
            id: string;
        }) => ({
            source: 'db' as const,
            name: f.kaiiName,
            reading: '', // DBにデータがあれば埋める
            description: f.content,
            label: '伝承に残る名',
            folkloreRef: f.id,
        }));

        // 2. LLMで新しい妖怪名を生成
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
        const prompt = buildConceptPrompt(handle, answers, folklore);
        const result = await model.generateContent(prompt);
        const responseText = result.response.text();

        // JSON を抽出（```json ... ``` ブロック対応）
        let llmConcept;
        try {
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                llmConcept = {
                    source: 'llm' as const,
                    name: parsed.name || '名無し',
                    reading: parsed.reading || '',
                    description: parsed.description || '',
                    label: 'あなたの体験から',
                };
            }
        } catch {
            console.warn('Failed to parse LLM concept:', responseText);
        }

        if (!llmConcept) {
            llmConcept = {
                source: 'llm' as const,
                name: '残り影',
                reading: 'のこりかげ',
                description: 'あなたの体験から生まれた名前。',
                label: 'あなたの体験から',
            };
        }

        return NextResponse.json({
            concepts: [...dbConcepts, llmConcept],
        });
    } catch (error) {
        console.error('generate-concepts error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}

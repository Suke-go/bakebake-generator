import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextResponse } from 'next/server';
import { loadEmbeddings, searchByEmbedding } from '@/lib/folklore-search';
import { buildSearchQuery } from '@/lib/prompt-builder';

export async function POST(req: Request) {
    try {
        const { handle, answers } = await req.json();

        if (!handle || !answers) {
            return NextResponse.json(
                { error: 'handle and answers are required' },
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

        // 1. 回答を検索クエリ文に変換
        const searchQuery = buildSearchQuery(handle, answers);

        // 2. Gemini embedding
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-embedding-001' });
        const embeddingResult = await model.embedContent(searchQuery);
        const queryEmbedding = embeddingResult.embedding.values;

        // 3. ローカル cosine similarity 検索
        const entries = await loadEmbeddings();
        const results = searchByEmbedding(queryEmbedding, entries, 5);

        return NextResponse.json({
            folklore: results,
            searchQuery,
        });
    } catch (error) {
        console.error('search-folklore error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}

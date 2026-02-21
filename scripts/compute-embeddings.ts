/**
 * Embedding 計算スクリプト
 *
 * raw-folklore.json から各エントリの embedding を計算し、
 * folklore-embeddings.json を出力する。
 *
 * Usage: npx tsx scripts/compute-embeddings.ts
 *
 * 必要な環境変数: GEMINI_API_KEY
 */

import { GoogleGenAI } from '@google/genai';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// .env.local を読み込み
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const DATA_DIR = path.join(process.cwd(), 'data');
const INPUT_FILE = path.join(DATA_DIR, 'raw-folklore.json');
const OUTPUT_FILE = path.join(DATA_DIR, 'folklore-embeddings.json');
const PROGRESS_FILE = path.join(DATA_DIR, 'embedding-progress.json');

const BATCH_SIZE = 100;    // Gemini embedding API のバッチサイズ
const DELAY_MS = 1000;     // レート制限対策

interface RawEntry {
    id: string;
    name: string;
    summary: string;
    location: string;
    source: string;
}

interface EmbeddedEntry {
    id: string;
    name: string;
    summary: string;
    location: string;
    source: string;
    embedding: number[];
}

async function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function loadProgress(): Set<string> {
    try {
        if (fs.existsSync(PROGRESS_FILE)) {
            const data = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8'));
            return new Set(data.completedIds);
        }
    } catch {
        // ignore
    }
    return new Set();
}

function saveProgress(completedIds: string[]): void {
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify({
        completedIds,
        timestamp: new Date().toISOString(),
    }));
}

/**
 * テキストをembedding用に整形
 */
function buildEmbeddingText(entry: RawEntry): string {
    const parts: string[] = [];

    if (entry.name) parts.push(entry.name);
    if (entry.summary) parts.push(entry.summary);
    if (entry.location && entry.location !== '日本各地') parts.push(`地域: ${entry.location}`);

    return parts.join(' ').trim();
}

async function main() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'your_gemini_api_key_here') {
        console.error('Error: GEMINI_API_KEY を .env.local に設定してください');
        process.exit(1);
    }

    if (!fs.existsSync(INPUT_FILE)) {
        console.error(`Error: ${INPUT_FILE} が見つかりません。scrape-yokai-db.ts を先に実行してください。`);
        process.exit(1);
    }

    console.log('=== Embedding 計算 ===');

    const rawData = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf-8'));
    const entries: RawEntry[] = rawData.entries;
    console.log(`入力: ${entries.length} エントリ`);

    // 要約がないエントリはフィルタ（embeddingの質が低い）
    const validEntries = entries.filter(e => e.summary && e.summary.length > 5);
    console.log(`有効エントリ（要約あり）: ${validEntries.length} 件`);

    const genAI = new GoogleGenAI({ apiKey });

    const completedIds = loadProgress();
    const pending = validEntries.filter(e => !completedIds.has(e.id));
    console.log(`未処理: ${pending.length} 件`);

    // 既存の結果を読み込み
    const results: EmbeddedEntry[] = [];
    if (completedIds.size > 0 && fs.existsSync(OUTPUT_FILE)) {
        const existing = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf-8'));
        results.push(...existing.entries);
    }

    // バッチ処理
    for (let i = 0; i < pending.length; i += BATCH_SIZE) {
        const batch = pending.slice(i, i + BATCH_SIZE);
        const texts = batch.map(buildEmbeddingText);

        try {
            // Gemini embedding API (batch)
            const batchResult = await genAI.models.embedContent({
                model: 'gemini-embedding-001',
                contents: texts,
                config: {
                    taskType: 'RETRIEVAL_DOCUMENT',
                    outputDimensionality: 768,
                },
            });
            const batchResults = batchResult.embeddings;
            if (!batchResults || batchResults.length !== batch.length) {
                throw new Error('Embedding batch size mismatch');
            }

            for (let j = 0; j < batch.length; j++) {
                const embedding = batchResults[j]?.values;
                if (!embedding) {
                    throw new Error(`Embedding is missing for entry ${batch[j].id}`);
                }
                results.push({
                    id: batch[j].id,
                    name: batch[j].name,
                    summary: batch[j].summary,
                    location: batch[j].location,
                    source: batch[j].source,
                    embedding,
                });
                completedIds.add(batch[j].id);
            }

            console.log(`  ${i + batch.length}/${pending.length} 件 (累計 ${results.length})`);

            // 定期保存
            if ((i + BATCH_SIZE) % (BATCH_SIZE * 5) === 0) {
                saveProgress([...completedIds]);
                fs.writeFileSync(OUTPUT_FILE, JSON.stringify({ entries: results }));
                console.log('  → 進捗保存');
            }
        } catch (err) {
            console.error(`  ⚠ バッチ ${i}-${i + batch.length} でエラー:`, err);
            // 進捗を保存してから終了
            saveProgress([...completedIds]);
            fs.writeFileSync(OUTPUT_FILE, JSON.stringify({ entries: results }));
            console.log('  → エラー時点の進捗を保存。再実行で続きから再開可能。');
            throw err;
        }

        await sleep(DELAY_MS);
    }

    // 最終保存
    saveProgress([...completedIds]);
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify({ entries: results }));

    // ファイルサイズ確認
    const stats = fs.statSync(OUTPUT_FILE);
    const sizeMB = (stats.size / 1024 / 1024).toFixed(1);

    console.log(`\n=== 完了 ===`);
    console.log(`出力: ${results.length} エントリ`);
    console.log(`ファイルサイズ: ${sizeMB} MB`);
    console.log(`出力先: ${OUTPUT_FILE}`);
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});

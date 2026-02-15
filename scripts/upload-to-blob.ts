/**
 * Vercel Blob アップロードスクリプト
 *
 * folklore-embeddings.json を Vercel Blob Storage にアップロードする。
 *
 * Usage: npx tsx scripts/upload-to-blob.ts
 *
 * 必要な環境変数: BLOB_READ_WRITE_TOKEN
 */

import { put } from '@vercel/blob';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const DATA_DIR = path.join(process.cwd(), 'data');
const INPUT_FILE = path.join(DATA_DIR, 'folklore-embeddings.json');

async function main() {
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (!token) {
        console.error('Error: BLOB_READ_WRITE_TOKEN を .env.local に設定してください');
        console.error('Vercel Dashboard → Storage → Blob → Create Store → Tokens から取得');
        process.exit(1);
    }

    if (!fs.existsSync(INPUT_FILE)) {
        console.error(`Error: ${INPUT_FILE} が見つかりません。compute-embeddings.ts を先に実行してください。`);
        process.exit(1);
    }

    const content = fs.readFileSync(INPUT_FILE);
    const sizeMB = (content.length / 1024 / 1024).toFixed(1);
    console.log(`アップロードファイル: ${INPUT_FILE} (${sizeMB} MB)`);

    console.log('Vercel Blob にアップロード中...');

    const blob = await put('folklore-embeddings.json', content, {
        access: 'public',
        contentType: 'application/json',
        token,
    });

    console.log(`\n=== アップロード完了 ===`);
    console.log(`URL: ${blob.url}`);
    console.log(`\n.env.local に以下を追加してください:`);
    console.log(`FOLKLORE_BLOB_URL=${blob.url}`);
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});

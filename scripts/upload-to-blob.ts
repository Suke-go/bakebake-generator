/**
 * Vercel Blob アップロードスクリプト
 *
 * 検索データ一式を Vercel Blob Storage にアップロードする。
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

// アップロード対象ファイル
const FILES_TO_UPLOAD = [
    { local: path.join(DATA_DIR, 'folklore-embeddings.json'), blobName: 'folklore-embeddings.json', contentType: 'application/json' },
    { local: path.join(DATA_DIR, 'analysis', 'projection-matrix.bin'), blobName: 'projection-matrix.bin', contentType: 'application/octet-stream' },
    { local: path.join(DATA_DIR, 'analysis', 'projected-vectors.bin'), blobName: 'projected-vectors.bin', contentType: 'application/octet-stream' },
    { local: path.join(DATA_DIR, 'analysis', 'projected-meta.json'), blobName: 'projected-meta.json', contentType: 'application/json' },
    // JSON fallbacks (kept for compatibility)
    { local: path.join(DATA_DIR, 'analysis', 'projected-embeddings.json'), blobName: 'projected-embeddings.json', contentType: 'application/json' },
    { local: path.join(DATA_DIR, 'analysis', 'projection-matrix.json'), blobName: 'projection-matrix.json', contentType: 'application/json' },
];

async function main() {
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (!token) {
        console.error('Error: BLOB_READ_WRITE_TOKEN を .env.local に設定してください');
        console.error('Vercel Dashboard → Storage → Blob → Create Store → Tokens から取得');
        process.exit(1);
    }

    const envLines: string[] = [];

    for (const file of FILES_TO_UPLOAD) {
        if (!fs.existsSync(file.local)) {
            console.warn(`⚠ ${file.local} が見つかりません、スキップ`);
            continue;
        }

        const content = fs.readFileSync(file.local);
        const sizeMB = (content.length / 1024 / 1024).toFixed(1);
        console.log(`\nアップロード: ${file.blobName} (${sizeMB} MB)...`);

        const blob = await put(file.blobName, content, {
            access: 'public',
            contentType: file.contentType,
            allowOverwrite: true,
            token,
        });

        console.log(`  ✓ URL: ${blob.url}`);

        // 環境変数名の生成
        const envKey = file.blobName
            .replace('.json', '')
            .replace(/-/g, '_')
            .toUpperCase() + '_BLOB_URL';
        envLines.push(`${envKey}=${blob.url}`);
    }

    console.log(`\n=== アップロード完了 ===`);
    console.log(`\n.env.local に以下を追加してください:\n`);
    for (const line of envLines) {
        console.log(line);
    }
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});

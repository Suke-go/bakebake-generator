/**
 * 妖怪データ取得スクリプト
 *
 * CyberAgentAILab/YokaiEval の yokai_list.json をダウンロードして
 * プロジェクト用に整形する。
 *
 * このデータセットはWikipediaベースの詳細な妖怪解説を含む。
 * 怪異・妖怪伝承DBよりも embedding 検索に適している
 * （詳細な物語・地域・特徴の記述がある）。
 *
 * Usage: npx tsx scripts/scrape-yokai-db.ts
 *
 * 出力: data/raw-folklore.json
 */

import * as fs from 'fs';
import * as path from 'path';

const DATA_URL = 'https://raw.githubusercontent.com/CyberAgentAILab/YokaiEval/main/data/yokai_list.json';
const OUTPUT_DIR = path.join(process.cwd(), 'data');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'raw-folklore.json');

interface YokaiEvalEntry {
    name: string;
    detail: string;
}

interface FolkloreEntry {
    id: string;
    name: string;
    summary: string;
    location: string;
    source: string;
}

/**
 * 妖怪名からWikipedia参照番号記法 [1] を除去
 */
function cleanName(name: string): string {
    return name.replace(/\[\d+\]/g, '').trim();
}

/**
 * detail テキストから地域情報を抽出（ヒューリスティック）
 */
function extractLocation(detail: string): string {
    // 都道府県名のパターン
    const prefectures = [
        '北海道', '青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県',
        '茨城県', '栃木県', '群馬県', '埼玉県', '千葉県', '東京都', '神奈川県',
        '新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県', '岐阜県',
        '静岡県', '愛知県', '三重県', '滋賀県', '京都府', '大阪府', '兵庫県',
        '奈良県', '和歌山県', '鳥取県', '島根県', '岡山県', '広島県', '山口県',
        '徳島県', '香川県', '愛媛県', '高知県', '福岡県', '佐賀県', '長崎県',
        '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県',
    ];

    const found: string[] = [];
    for (const pref of prefectures) {
        if (detail.includes(pref)) {
            found.push(pref);
        }
    }

    // 旧国名も探す
    const oldRegions = [
        '陸奥国', '出羽国', '常陸国', '下総国', '上総国', '安房国',
        '武蔵国', '相模国', '甲斐国', '信濃国', '越後国', '越中国',
        '能登国', '加賀国', '越前国', '美濃国', '飛騨国', '遠江国',
        '駿河国', '伊豆国', '伊勢国', '近江国', '山城国', '大和国',
        '河内国', '和泉国', '摂津国', '紀伊国', '丹波国', '丹後国',
        '但馬国', '因幡国', '伯耆国', '出雲国', '備前国', '備中国',
        '備後国', '安芸国', '周防国', '長門国', '阿波国', '讃岐国',
        '伊予国', '土佐国', '筑前国', '筑後国', '豊前国', '豊後国',
        '肥前国', '肥後国', '日向国', '大隅国', '薩摩国', '琉球国',
    ];

    for (const region of oldRegions) {
        if (detail.includes(region)) {
            found.push(region);
        }
    }

    return found.length > 0 ? found.slice(0, 3).join('、') : '日本各地';
}

/**
 * detail から要約を生成（最初の2-3文を取得）
 */
function extractSummary(detail: string): string {
    // Wikipedia参照番号を除去
    const clean = detail.replace(/\[\d+\]/g, '');

    // 改行で分割して最初の段落を取得
    const paragraphs = clean.split('\n').filter(p => p.trim().length > 0);
    if (paragraphs.length === 0) return '';

    // 最初の段落から2-3文を取得
    const firstPara = paragraphs[0];
    const sentences = firstPara.split(/(?<=[。！？])/);
    const summary = sentences.slice(0, 3).join('').trim();

    // 200文字以内に制限
    return summary.length > 200 ? summary.substring(0, 200) + '…' : summary;
}

async function main() {
    console.log('=== 妖怪データ取得 ===');
    console.log(`ソース: CyberAgentAILab/YokaiEval`);

    // 出力ディレクトリ作成
    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    // データダウンロード
    console.log('データをダウンロード中...');
    const res = await fetch(DATA_URL);
    if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${DATA_URL}`);
    }

    const rawData: YokaiEvalEntry[] = await res.json();
    console.log(`ダウンロード完了: ${rawData.length} エントリ`);

    // 変換
    console.log('データを変換中...');
    const entries: FolkloreEntry[] = [];
    const seen = new Set<string>();

    for (let i = 0; i < rawData.length; i++) {
        const raw = rawData[i];
        if (!raw.detail || raw.detail.trim().length < 10) continue;

        const name = cleanName(raw.name);
        if (seen.has(name)) continue; // 重複排除
        seen.add(name);

        const summary = extractSummary(raw.detail);
        if (!summary) continue;

        entries.push({
            id: `yokai-${String(i).padStart(4, '0')}`,
            name,
            summary,
            location: extractLocation(raw.detail),
            source: 'CyberAgentAILab/YokaiEval (Wikipedia)',
        });
    }

    // 保存
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify({ entries }, null, 2));

    const sizeMB = (fs.statSync(OUTPUT_FILE).size / 1024 / 1024).toFixed(1);
    console.log(`\n=== 完了 ===`);
    console.log(`有効エントリ: ${entries.length} 件`);
    console.log(`ファイルサイズ: ${sizeMB} MB`);
    console.log(`出力先: ${OUTPUT_FILE}`);

    // サンプル表示
    console.log('\n--- サンプル (最初の3件) ---');
    for (const entry of entries.slice(0, 3)) {
        console.log(`  ${entry.name}: ${entry.summary.substring(0, 60)}...`);
        console.log(`  地域: ${entry.location}`);
        console.log();
    }
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});

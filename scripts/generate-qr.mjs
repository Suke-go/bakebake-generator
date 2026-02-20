/**
 * 参加者向けQRコード生成スクリプト
 * 
 * 使い方: node scripts/generate-qr.mjs [URL]
 * デフォルト: https://yokai.vercel.app/survey/enter
 * 
 * 出力: public/qr-survey-enter.svg
 */

import { writeFileSync } from 'fs';

const url = process.argv[2] || 'https://yokai.vercel.app/survey/enter';

// QR Code Matrix generation (simplified but functional)
// Using the qrcode library from npm
async function main() {
    const { default: QRCode } = await import('qrcode');

    // SVG出力
    const svg = await QRCode.toString(url, {
        type: 'svg',
        errorCorrectionLevel: 'H',
        margin: 2,
        width: 400,
        color: {
            dark: '#000000',
            light: '#ffffff',
        },
    });

    writeFileSync('public/qr-survey-enter.svg', svg);
    console.log(`✓ SVG QR code saved to public/qr-survey-enter.svg`);
    console.log(`  URL: ${url}`);

    // Also generate a standalone HTML page for easy printing
    const html = `<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>妖怪生成装置 — 参加者アンケート QRコード</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            background: #fff;
            font-family: 'Shippori Mincho B1', serif;
            color: #1a1a1a;
        }
        .container {
            text-align: center;
            padding: 40px;
        }
        h1 {
            font-size: 28px;
            letter-spacing: 0.2em;
            margin-bottom: 12px;
            font-weight: 500;
        }
        .subtitle {
            font-size: 14px;
            color: #666;
            margin-bottom: 40px;
            letter-spacing: 0.1em;
        }
        .qr-frame {
            display: inline-block;
            padding: 24px;
            border: 2px solid #e0e0e0;
            border-radius: 4px;
            margin-bottom: 32px;
        }
        .qr-frame svg {
            width: 300px;
            height: 300px;
        }
        .instruction {
            font-size: 16px;
            letter-spacing: 0.08em;
            line-height: 2;
            color: #444;
            max-width: 400px;
        }
        .url {
            font-size: 11px;
            color: #999;
            margin-top: 24px;
            font-family: monospace;
            letter-spacing: 0;
        }
        @media print {
            body { background: #fff; }
            .url { display: none; }
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>妖怪生成装置</h1>
        <p class="subtitle">参加者アンケート</p>
        <div class="qr-frame">
            ${svg}
        </div>
        <p class="instruction">
            スマートフォンでQRコードを読み取り、<br>
            アンケートにお答えください。
        </p>
        <p class="url">${url}</p>
    </div>
</body>
</html>`;

    writeFileSync('public/qr-survey-enter.html', html);
    console.log(`✓ Printable HTML saved to public/qr-survey-enter.html`);
}

main().catch(console.error);

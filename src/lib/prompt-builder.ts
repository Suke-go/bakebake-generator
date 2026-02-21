/**
 * プロンプト構築ユーティリティ
 *
 * ユーザーの回答を自然文やAPIプロンプトに変換する。
 * 命名規則: 柳田國男『妖怪談義』の妖怪名彙における命名慣習に準拠
 * 物語生成: 怪異・妖怪伝承データベース（日文研）の記録構造を参照
 */

export interface UserAnswers {
    event?: string;
    perception?: string;
    where?: string;
    when?: string;
    impression?: string;
    nature?: string;
}

export interface HandleInfo {
    id: string;
    text: string;
    shortText?: string;
}

export interface ConceptInfo {
    name: string;
    reading: string;
    description: string;
}

export interface FolkloreEntry {
    kaiiName: string;
    content: string;
    location?: string;
}

/**
 * Phase 1' の回答を、embedding検索用の自然文に変換
 */
export function buildSearchQuery(handle: HandleInfo, answers: UserAnswers): string {
    const parts: string[] = [];

    // 体験の要約を最初の文として扱う
    parts.push(handle.text.replace('\n', ''));

    // 体験レポートとしての自然な文脈を構築
    const contextLines = [];

    if (answers.perception?.trim()) {
        contextLines.push(answers.perception);
    }

    if (answers.where?.trim() || answers.when?.trim()) {
        const time = answers.when?.trim() ? `${answers.when}のころ、` : '';
        const place = answers.where?.trim() ? `${answers.where}で` : '';
        contextLines.push(`${time}${place}`);
    }

    if (answers.impression?.trim()) {
        contextLines.push(`その体験は${answers.impression}。`);
    }

    if (answers.nature?.trim()) {
        contextLines.push(`それは${answers.nature}。`);
    }

    if (contextLines.length > 0) {
        parts.push(contextLines.join(''));
    }

    return parts.join('。') + '。';
}

/**
 * 妖怪名のLLM生成プロンプト（柳田國男『妖怪名彙』の命名慣習に準拠）
 *
 * 3つの命名パターンから候補を生成（柳田國男『妖怪名彙』・香川雅信『妖怪を名づける』参照）:
 * 1. 現象描写型（小豆洗い＝音の怪、砂かけ婆＝行為、送り犬＝行動）
 * 2. 場所・出現条件型（磯女＝場所、橋姫＝場所、夜行さん＝時間）
 * 3. 感覚・擬声型（ベトベトサン＝擬音、ヒダルガミ＝身体感覚、ケサランパサラン＝口承音韻）
 */
export function buildConceptPrompt(
    handle: HandleInfo,
    answers: UserAnswers,
    folklore: Array<{ kaiiName: string; content: string }>
): string {
    const context = buildSearchQuery(handle, answers);
    const folkloreRef = folklore
        .map(f => `- ${f.kaiiName}: ${f.content}`)
        .join('\n');

    return [
        'あなたは日本の民俗学（柳田國男『妖怪談義』）に基づく妖怪研究者です。',
        'ユーザーの体験に基づいて、新しい妖怪の名前を【3つ】提案してください。',
        '',
        '## 命名ルール（柳田國男『妖怪名彙』の命名慣習に準拠）',
        '',
        '### 候補1【現象描写型】',
        '体験で起きた現象・行為そのものを名前にした漢字2-4文字の名前。',
        '実例: 小豆洗い（小豆を洗う音）、砂かけ婆（砂をかける行為）、送り犬（後をつける犬）、枕返し（枕の位置を変える）',
        '',
        '### 候補2【場所・出現条件型】',
        '体験の場所・時間・条件に由来する名前。柳田國男が指摘した「妖怪は場所につく」原則に基づく。',
        '実例: 磯女（磯に現れる女）、橋姫（橋に出る）、夜行さん（夜に出歩く）、青行燈（青い灯りのそば）',
        '',
        '### 候補3【感覚・擬声型】',
        '体験の音・身体感覚・オノマトペに由来する名前。カタカナ・ひらがなを含む。',
        '実例: ベトベトサン（足音の擬音）、ヒダルガミ（空腹感）、ケサランパサラン（口承の音韻）、アマビエ（名乗りの音）',
        '',
        '## ユーザーの体験',
        context,
        '',
        '## 参照した類似の既存伝承（実在）',
        folkloreRef,
        '',
        '## 重要な注意',
        '- 鳥山石燕が口承の怪異を図鑑化し視覚を与えたように、上記の伝承を参考にしつつ独自の名前を作ること',
        '- 既存の妖怪名をそのまま使わないこと',
        '- 各候補にはその命名根拠を一言で添えること',
        '',
        '## 出力形式（JSON）',
        '```json',
        '[',
        '  {',
        '    "name": "漢字の名前",',
        '    "reading": "ひらがなの読み",',
        '    "description": "この名前の由来（10-20文字）",',
        '    "type": "place_action"',
        '  },',
        '  {',
        '    "name": "外見や音に由来する名前",',
        '    "reading": "ひらがな",',
        '    "description": "由来（10-20文字）",',
        '    "type": "appearance_sound"',
        '  },',
        '  {',
        '    "name": "カタカナやひらがなの名前",',
        '    "reading": "",',
        '    "description": "由来（10-20文字）",',
        '    "type": "vernacular"',
        '  }',
        ']',
        '```',
        '',
        'JSON配列のみを出力してください。',
    ].join('\n');
}

/**
 * 画像生成プロンプトの構築
 *
 * ユーザーの体験回答（answers）から雰囲気・環境・トーンを抽出し、
 * 画像の世界観に反映する。
 */
export function buildImagePrompt(
    concept: ConceptInfo,
    stylePrompt: string,
    visualInput?: string,
    negativeHints?: string,
    answers?: UserAnswers
): string {
    const parts = [
        stylePrompt,
        '',
        `Subject: A Japanese yokai called "${concept.name}" (${concept.reading}).`,
        `Description: ${concept.description}`,
    ];

    // ユーザーの体験を画像の世界観に反映
    if (answers) {
        const sceneParts: string[] = [];
        if (answers.where?.trim()) {
            sceneParts.push(`Setting/environment: ${answers.where}`);
        }
        if (answers.when?.trim()) {
            sceneParts.push(`Time of encounter: ${answers.when}`);
        }
        if (answers.perception?.trim()) {
            sceneParts.push(`The encounter felt like: ${answers.perception}`);
        }
        if (answers.impression?.trim()) {
            sceneParts.push(`Emotional atmosphere: ${answers.impression}`);
        }
        if (answers.nature?.trim()) {
            sceneParts.push(`Nature of the presence: ${answers.nature}`);
        }
        if (sceneParts.length > 0) {
            parts.push('');
            parts.push('Scene context from the witness encounter:');
            parts.push(sceneParts.join('. ') + '.');
        }
    }

    if (visualInput) {
        parts.push(`User's vision: ${visualInput}`);
    }

    parts.push('');
    parts.push('The yokai should be the central focus of the image.');
    parts.push('Fuse the traditional art style\'s qualities (brushwork, materials, composition) with the specific atmosphere of the encounter described above.');
    parts.push('The scene should feel rooted in Japanese folklore tradition while being shaped by the witness\'s unique experience.');

    if (negativeHints) {
        parts.push('');
        parts.push(`Avoid: ${negativeHints}`);
    }

    return parts.join('\n');
}

/**
 * ナラティブ（物語テキスト）生成プロンプト
 *
 * 怪異・妖怪伝承データベース（国際日本文化研究センター）の
 * 記録形式（番号・呼称・出典・話者・地域・要約）を参照し、
 * 体験者の報告を主軸にした説話を生成する。
 *
 * 構造: 体験者の報告 → 怪異情報 → 既存伝承（参考のみ） → 出力ルール
 * LLMが先行コンテキストに引きずられるため、体験を先頭に置く。
 */
export function buildNarrativePrompt(
    concept: ConceptInfo,
    answers: UserAnswers,
    folklore: FolkloreEntry[]
): string {
    const folkloreRef = folklore
        .map(f => {
            const loc = f.location ? `（${f.location}）` : '';
            return `- ${f.kaiiName}${loc}: ${f.content}`;
        })
        .join('\n');

    // 体験者の報告を自然文として構成（フィールド列挙ではなく物語的に）
    const experienceParts: string[] = [];
    if (answers.when?.trim()) {
        experienceParts.push(`${answers.when}のころ`);
    }
    if (answers.where?.trim()) {
        experienceParts.push(`${answers.where}にて`);
    }
    if (answers.perception?.trim()) {
        experienceParts.push(answers.perception);
    }
    if (answers.impression?.trim()) {
        experienceParts.push(`その体験は${answers.impression}`);
    }
    if (answers.nature?.trim()) {
        experienceParts.push(`それは${answers.nature}`);
    }
    const experienceText = experienceParts.length > 0
        ? experienceParts.join('。') + '。'
        : '（体験の詳細なし）';

    return [
        'あなたは民俗学の調査員です。',
        '以下の「体験者の報告」を主軸にしつつ、類似する既存伝承の語り口や風土感を活かして、',
        '怪異・妖怪伝承データベース（国際日本文化研究センター）の',
        '要約形式（約100字の伝聞調記録）を模した新しい伝承を1件作成してください。',
        '',
        '## 体験者の報告（★中核：この体験の固有要素を必ず反映すること）',
        experienceText,
        '',
        '## 新たに観測された怪異',
        `呼称: ${concept.name}（${concept.reading}）`,
        `説明: ${concept.description}`,
        '',
        ...(folkloreRef ? [
            '## 類似する既存伝承（実在）',
            folkloreRef,
            '',
        ] : []),
        '## 出力ルール',
        '- 「〜という。」「〜と伝えられている。」のような伝聞調で書くこと',
        '- 体験者の場所・知覚・印象を物語の骨格にすること（ここが他の伝承と違う独自性の源）',
        '- 既存伝承の語り口・雰囲気・モチーフは積極的に取り入れてよいが、筋書きをそのまま借用しないこと',
        '- 2-3文、50-100文字程度の簡潔な伝承記録として出力すること',
        '- 日本語で出力すること',
        '- 伝承テキストのみを出力すること（前置きや説明は不要）',
    ].filter(Boolean).join('\n');
}

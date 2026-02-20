/**
 * プロンプト構築ユーティリティ
 *
 * ユーザーの回答を自然文やAPIプロンプトに変換する。
 * 命名規則: 柳田國男『妖怪談義』の4軸分類に準拠
 * 物語生成: 怪異・妖怪伝承データベース（日文研）の記録構造を参照
 */

export interface UserAnswers {
    event?: string;
    where?: string;
    when?: string;
    noticed?: string;
    texture?: string;
    alone?: string;
    reaction?: string;
    stance?: string;
    absence?: string;
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
 * Phase 1' の回答9問を、embedding検索用の自然文に変換
 */
export function buildSearchQuery(handle: HandleInfo, answers: UserAnswers): string {
    const parts: string[] = [];

    // 体験の要約
    parts.push(handle.text.replace('\n', ''));

    if (answers.event?.trim()) parts.push(`${answers.event}とき`);
    if (answers.where?.trim()) parts.push(`${answers.where}で`);
    if (answers.when?.trim()) parts.push(`（${answers.when}）`);
    if (answers.noticed?.trim()) parts.push(`${answers.noticed}`);
    if (answers.texture?.trim()) parts.push(`体の感覚は${answers.texture}`);
    if (answers.alone?.trim()) parts.push(answers.alone);
    if (answers.reaction?.trim()) parts.push(`そのとき${answers.reaction}`);
    if (answers.stance?.trim()) parts.push(`いまは${answers.stance}`);
    if (answers.absence?.trim()) parts.push(`姿は${answers.absence}`);

    return parts.join('。') + '。';
}

/**
 * 妖怪名のLLM生成プロンプト（柳田國男の4軸分類に準拠）
 *
 * 3つの命名パターンから候補を生成:
 * 1. 場所・行動型（磯女、小豆洗い、送り犬）
 * 2. 外見・音型（一つ目小僧、べとべとさん、畳叩き）
 * 3. 土着・方言型（アマビエ、ケサランパサラン、イジコ）
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
        '## 命名ルール（柳田國男の4軸分類に準拠）',
        '',
        '### 候補1【場所・行動型】',
        '体験の場所や行動を組み合わせた漢字2-4文字の名前。',
        '実例: 磯女（磯に現れる女）、小豆洗い（小豆を洗う音）、送り犬（人について来る犬）、砂かけ婆（砂をかけてくる）',
        '',
        '### 候補2【外見・音型】',
        '体験で感知した姿・質感・音に由来する名前。',
        '実例: 一つ目小僧（目が一つ）、べとべとさん（べとべとという足音）、畳叩き（畳を叩く音）、青行燈（青い灯り）',
        '',
        '### 候補3【土着・方言型】',
        '地方の口承に現れるような、カタカナ・ひらがな・オノマトペの名前。',
        '実例: アマビエ、ケサランパサラン、イジコ、ヒダルガミ、ベトベトサン',
        '',
        '## ユーザーの体験',
        context,
        '',
        '## 参照した類似の既存伝承（実在）',
        folkloreRef,
        '',
        '## 重要な注意',
        '- 鳥山石燕が既存伝承を基に創作的に拡張したように、上記の伝承を参考にしつつ独自の名前を作ること',
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
 */
export function buildImagePrompt(
    concept: ConceptInfo,
    stylePrompt: string,
    visualInput?: string
): string {
    const parts = [
        stylePrompt,
        '',
        `Subject: A Japanese yokai called "${concept.name}" (${concept.reading}).`,
        `Description: ${concept.description}`,
    ];

    if (visualInput) {
        parts.push(`User's vision: ${visualInput}`);
    }

    parts.push('');
    parts.push('The yokai should be the central focus of the image.');
    parts.push('Capture a sense of mystery, the supernatural, and the uncanny.');
    parts.push('The atmosphere should feel like encountering something from another world.');

    return parts.join('\n');
}

/**
 * ナラティブ（物語テキスト）生成プロンプト
 *
 * 怪異・妖怪伝承データベース（国際日本文化研究センター）の
 * 記録形式（呼称・地域・場所・時・現象・出典）を参照し、
 * 実在の類似伝承のエッセンスを織り込んだ説話を生成する。
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

    return [
        'あなたは民俗学の調査員です。',
        '以下の「類似する既存の伝承（実在）」と「体験者の報告」を元に、',
        '怪異・妖怪伝承データベース（国際日本文化研究センター）の',
        '記録形式を模して、新しい伝承を1件作成してください。',
        '',
        '## 類似する既存の伝承（実在）',
        folkloreRef || '（該当なし）',
        '',
        '## 新たに観測された怪異',
        `呼称: ${concept.name}（${concept.reading}）`,
        `説明: ${concept.description}`,
        '',
        '## 体験者の報告',
        answers.where ? `- 場所: ${answers.where}` : '',
        answers.when ? `- 時: ${answers.when}` : '',
        answers.texture ? `- 身体感覚: ${answers.texture}` : '',
        answers.noticed ? `- 気づいたこと: ${answers.noticed}` : '',
        answers.reaction ? `- 反応: ${answers.reaction}` : '',
        answers.absence ? `- 姿: ${answers.absence}` : '',
        '',
        '## 出力ルール',
        '- 「〜という。」「〜と伝えられている。」のような伝聞調で書くこと',
        '- 上記の既存伝承のディテール（語り口、地域の雰囲気、行動描写）を自然に織り込むこと',
        '- 2-3文、50-100文字程度の簡潔な伝承記録として出力すること',
        '- 地域名や場所の描写を含めること',
        '- 日本語で出力すること',
        '- 伝承テキストのみを出力すること（前置きや説明は不要）',
    ].filter(Boolean).join('\n');
}

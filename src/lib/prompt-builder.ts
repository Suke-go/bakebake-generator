/**
 * プロンプト構築ユーティリティ
 *
 * ユーザーの回答を自然文やAPIプロンプトに変換する。
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

/**
 * Phase 1' の回答9問を、embedding検索用の自然文に変換
 */
export function buildSearchQuery(handle: HandleInfo, answers: UserAnswers): string {
    const parts: string[] = [];

    // 体験の要約
    parts.push(handle.text.replace('\n', ''));

    if (answers.event) parts.push(`${answers.event}とき`);
    if (answers.where) parts.push(`${answers.where}で`);
    if (answers.when) parts.push(`（${answers.when}）`);
    if (answers.noticed) parts.push(`${answers.noticed}`);
    if (answers.texture) parts.push(`体の感覚は${answers.texture}`);
    if (answers.alone) parts.push(answers.alone);
    if (answers.reaction) parts.push(`そのとき${answers.reaction}`);
    if (answers.stance) parts.push(`いまは${answers.stance}`);
    if (answers.absence) parts.push(`姿は${answers.absence}`);

    return parts.join('。') + '。';
}

/**
 * 妖怪名のLLM生成プロンプト
 */
export function buildConceptPrompt(
    handle: HandleInfo,
    answers: UserAnswers,
    folklore: Array<{ kaiiName: string; content: string }>
): string {
    const context = buildSearchQuery(handle, answers);
    const folkloreNames = folklore.map(f => f.kaiiName).join('、');

    return [
        'あなたは日本の妖怪研究者です。',
        'ユーザーの体験に基づいて、まだ名前のない新しい妖怪の名前を1つ作ってください。',
        '',
        '## ユーザーの体験',
        context,
        '',
        '## 類似する既存の妖怪',
        folkloreNames,
        '',
        '## 出力形式（JSON）',
        '```json',
        '{',
        '  "name": "漢字の名前（2-4文字）",',
        '  "reading": "ひらがなの読み",',
        '  "description": "一行の説明（20-40文字）"',
        '}',
        '```',
        '',
        '既存の妖怪名とは異なる、詩的で美しい名前をつけてください。',
        '説明は「〜する存在」「〜に現れる」のような簡潔な形式で。',
        'JSONのみを出力してください。',
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
 */
export function buildNarrativePrompt(
    concept: ConceptInfo,
    answers: UserAnswers
): string {
    return [
        'あなたは怪談の語り部です。',
        '以下の妖怪と体験者の情報をもとに、2-3文の短い語りを書いてください。',
        '',
        `妖怪: ${concept.name}（${concept.reading}）`,
        `説明: ${concept.description}`,
        '',
        '体験者の情報:',
        answers.texture ? `- 体の感覚: ${answers.texture}` : '',
        answers.where ? `- 場所: ${answers.where}` : '',
        answers.when ? `- 時期: ${answers.when}` : '',
        answers.stance ? `- 態度: ${answers.stance}` : '',
        '',
        '語りの口調:',
        '- 静かで、少し怖い',
        '- 「〜たという。」「〜たそうだ。」のような伝聞調',
        '- 簡潔に（50-100文字）',
        '- 日本語で出力してください',
    ].filter(Boolean).join('\n');
}

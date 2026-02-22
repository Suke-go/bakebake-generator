/**
 * 妖怪画の画風 → 画像生成プロンプト マッピング
 *
 * 各画風は歴史的な妖怪画の伝統に基づく。
 * 具体的な技法名・作品名・視覚的特徴を明記し、
 * AI画像生成モデルが正確にスタイルを再現できるよう設計。
 */

export const ART_STYLE_PROMPTS: Record<string, {
    prompt: string;
    negativeHints: string;
}> = {
    sumi: {
        prompt: [
            // 系譜と媒体
            "Traditional Japanese sumi-e ink painting (水墨画).",
            "Medium: black sumi ink on aged kōzo-fiber washi paper with visible plant fibers and warm ivory tone.",
            // 具体的技法（雪舟 破墨山水図 1495年 国宝）
            "Technique: hatsuboku (潑墨) — ink splashed and pooled into wet paper, forms emerging from ink bleeding rather than drawn lines.",
            "Technique: haboku (破墨) — layers of pale ink washes overlaid with dark accent strokes while still wet, creating depth through tonal collision.",
            // 等伯 松林図屏風の具体的視覚特徴
            "Technique: mokkotsu (没骨) boneless method — no outlines; the yokai's silhouette dissolves into graduated ink washes like Hasegawa Tōhaku's Pine Trees screen (松林図屏風).",
            // 渇筆の具体的用途
            "Dry-brush kasshitsu (渇筆) strokes with split-bristle marks for coarse textures: matted fur, cracked bark skin, frayed cloth.",
            // 石燕の拭きぼかし（版本由来の墨グラデーション）
            "Fukibokashi (拭きぼかし) soft ink gradation around the figure, as in Toriyama Sekien's Gazu Hyakki Yagyō woodblock prints (1776).",
            // 余白と空間の具体的指示
            "60-70% of the composition is yohaku (余白) empty space — raw paper representing mist, void, and the liminal space between worlds.",
            // 照明と色温度
            "Lighting: diffused, as if seen through morning fog. No direct light source. Tonal range from dilute gray wash to dense lamp-black.",
            // 構図
            "Composition: single solitary yokai, asymmetrically placed, facing partially away. Intimate scroll-painting format.",
        ].join(' '),
        negativeHints: 'color, vivid colors, colored ink, digital, modern, photograph, photorealistic, 3D render, anime, hard black outlines, flat cel shading, watermark, text, multiple characters, busy background, symmetrical composition',
    },

    emaki: {
        prompt: [
            // 系譜
            "In the style of Hyakki Yagyō Emaki (百鬼夜行絵巻), referencing the Daitoku-ji Shinjuan manuscript (大徳寺真珠庵本, Muromachi period).",
            // 媒体と画材の具体的描写
            "Medium: mineral pigments (岩絵具) on Japanese paper — azurite blue (群青), vermillion red (朱), malachite green (緑青), shell white (胡粉), with gold leaf accents (金箔).",
            // やまと絵の具体的技法
            "Yamato-e painting tradition: tsukuri-e (付立絵) layered opaque pigment technique with rich, saturated earth tones.",
            // 構図の具体的指示
            "Composition: horizontal scroll format, the yokai shown as if in a night procession (百鬼夜行), moving from right to left.",
            // 絵巻固有の表現
            "Fukinuki yatai (吹抜屋台) bird's-eye perspective with removed roof. Suyari-gasumi (すやり霞) horizontal band-shaped trailing clouds separating scenes.",
            // 付喪神の具体的描写
            "If depicting tsukumogami (付喪神): household objects (pots, fans, umbrellas, musical instruments) transformed into animate creatures with sprouted limbs and expressive faces.",
            // 人物が描かれる場合
            "Hikime-kagihana (引目鉤鼻) stylized slit-eyes and hook-nose for any human faces.",
            // 照明
            "Lighting: warm torch-light glow against deep indigo night sky. Rich shadows cast by firelight.",
        ].join(' '),
        negativeHints: 'digital, modern, photograph, 3D, monochrome, black and white, sketch, pencil, anime style, watermark, text',
    },

    ukiyoe: {
        prompt: [
            // 系譜と具体的参照作品
            "Edo-period nishiki-e (錦絵) multi-color woodblock print in the style of Utagawa Kuniyoshi (歌川国芳, 1797–1861) and Tsukioka Yoshitoshi (月岡芳年, 1839–1892).",
            // 媒体と画材
            "Medium: water-based pigments block-printed on hosho washi paper (奉書紙). Visible wood-grain texture (木目) from cherry-wood blocks.",
            // 国芳の構図特徴（相馬の古内裏を参照）
            "Composition: dramatic triptych-style (三枚続) framing with the yokai dominating the picture plane, minimal unused space.",
            // 色彩の具体的指示
            "Color palette: Prussian blue (ベロ藍/Berlin blue) for water and sky, vermillion (朱) for accents and flames, sumi black for bold keyblock outlines (墨線).",
            // 摺り技法
            "Printing techniques: bokashi (ぼかし) ink gradation on sky and water areas, especially ichimoji-bokashi (一文字ぼかし) horizontal fade at top edge.",
            // 芳年の具体的表現
            "From Yoshitoshi's Shinkei Sanjūrokkaisen (新形三十六怪撰): karazuri (空摺り) blind embossing for texture on fabric and skin, mushikui (虫食い) worm-eaten border frame.",
            // 人物表現
            "Figure style: anatomically precise with theatrical kabuki-like poses, expressive facial features, dynamic diagonal movement lines.",
        ].join(' '),
        negativeHints: 'photograph, photorealistic, 3D render, digital painting, watercolor wash, oil painting, soft edges, blurry, anime, watermark, text',
    },

    manga: {
        prompt: [
            // 系譜（作家名なし・技法ジャンルで特定）
            "Japanese horror manga illustration (妖怪漫画) in the gekiga (劇画) tradition of 1960s–70s yokai comics.",
            // 媒体
            "Medium: black India ink (製図インク) on Kent paper, pen nib and brush illustration.",
            // 点描＋ハッチングの重ね技法
            "Technique: dense stippling (点描) applied to yokai skin and shadows — hundreds of tiny ink dots creating an eerie, grainy texture. Hatching and cross-hatching layered over stippling for maximum tonal depth.",
            // ベタの使用
            "Heavy beta (ベタ) solid black ink fills for deep shadows and night sky, creating stark high-contrast light/dark areas.",
            // 背景の綻密描写
            "Background: hyper-detailed realistic environment (trees, buildings, grass rendered with obsessive cross-hatching, fine linework, and photographic reference-level precision) creating stark contrast with the simpler yokai character design.",
            // キャラクターデザイン
            "Character design: yokai with rounded, slightly cartoonish proportions — simple dot-eyes or slit-eyes, exaggerated expressions — juxtaposed against the obsessively rendered background.",
            // トーン表現
            "No screentone (スクリーントーン): all shading achieved through hand-drawn stippling, hatching, and solid black areas only.",
            // 雰囲気
            "Mood: eerie and atmospheric with a sense of lived-in familiarity — the boundary between the mundane and the supernatural rendered ambiguous.",
        ].join(' '),
        negativeHints: 'photograph, photorealistic, 3D, oil painting, watercolor, realistic shading, gradient, digital coloring, screentone dots, anime cel shading, color, watermark',
    },

    dennou: {
        prompt: [
            "Contemporary digital art reinterpretation of a Japanese yokai.",
            "Visual style: dark atmospheric concept art with volumetric fog and rim lighting.",
            "Particle effects: floating luminous motes, subtle data-glitch artifacts (RGB channel splitting, scan lines, pixel displacement) revealing the yokai's digital-supernatural nature.",
            "Color palette: deep indigo-black background (#0a0a1a) with accent glow in electric cyan (#00f5ff) and hot magenta (#ff0066).",
            "Lighting: single strong backlight creating silhouette with neon edge-glow. Volumetric light rays cutting through fog.",
            "Texture: mix of organic (cracked skin, wispy hair) and digital (circuit-trace patterns, holographic iridescence on surfaces).",
            "Composition: cinematic wide-angle, low camera angle looking up at the yokai. Shallow depth of field.",
            "Quality: concept art quality, 4K detail, sharp focus on yokai with bokeh background.",
        ].join(' '),
        negativeHints: 'traditional, woodblock, ink drawing, old paper, manga, anime, simple, flat colors, watermark, text, low quality, blurry',
    },
};

/**
 * 画風IDからプロンプト文字列を取得
 */
export function getStylePrompt(artStyle: string | null): string {
    if (!artStyle || !ART_STYLE_PROMPTS[artStyle]) {
        return ART_STYLE_PROMPTS.sumi.prompt; // default
    }
    return ART_STYLE_PROMPTS[artStyle].prompt;
}

/**
 * 画風IDからネガティブヒント文字列を取得
 */
export function getNegativeHints(artStyle: string | null): string {
    if (!artStyle || !ART_STYLE_PROMPTS[artStyle]) {
        return ART_STYLE_PROMPTS.sumi.negativeHints;
    }
    return ART_STYLE_PROMPTS[artStyle].negativeHints;
}

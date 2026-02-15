/**
 * 妖怪画の画風 → 画像生成プロンプト マッピング
 *
 * 各画風は歴史的な妖怪画の伝統に基づく。
 */

export const ART_STYLE_PROMPTS: Record<string, {
    prompt: string;
    negativeHints: string;
}> = {
    sumi: {
        prompt: [
            "In the style of Toriyama Sekien's Gazu Hyakki Yagyō (画図百鬼夜行, 1776).",
            "Monochrome ink drawing (墨絵) on aged paper.",
            "Single yokai depicted alone, encyclopedic illustration style.",
            "Precise brushwork with subtle ink wash gradations (濃淡).",
            "Minimal background, emphasis on the creature's form.",
            "Classical Japanese monster encyclopedia aesthetic.",
        ].join(' '),
        negativeHints: 'color, digital, modern, photograph, 3D',
    },

    emaki: {
        prompt: [
            "In the style of Hyakki Yagyō Emaki (百鬼夜行絵巻) scroll painting.",
            "Heian to Muromachi period aesthetic (平安〜室町).",
            "Rich mineral pigments (岩絵具) on paper, warm earth tones.",
            "Yokai in a narrative scene, as if part of a procession.",
            "Flat perspective (吹抜屋台), decorative clouds (すやり霞).",
            "Gold leaf accents, elegant brushwork.",
        ].join(' '),
        negativeHints: 'digital, modern, photograph, 3D, monochrome',
    },

    ukiyoe: {
        prompt: [
            "In the style of Utagawa Kuniyoshi (歌川国芳) or Tsukioka Yoshitoshi (月岡芳年) nishiki-e.",
            "Vivid woodblock print colors with bold black outlines.",
            "Dramatic composition with theatrical presence.",
            "Bokashi gradation technique in background.",
            "Visible woodgrain texture, ukiyo-e color palette.",
            "Dynamic pose, powerful and expressive.",
        ].join(' '),
        negativeHints: 'photograph, 3D, digital painting, watercolor',
    },

    manga: {
        prompt: [
            "In the style of Mizuki Shigeru's (水木しげる) GeGeGe no Kitarō.",
            "Pen and ink illustration with detailed crosshatching for shadows.",
            "Screen tone (スクリーントーン) patterns for texture.",
            "Approachable character design with expressive features.",
            "Slightly humorous, warm feeling despite the supernatural subject.",
            "Japanese manga aesthetic, hand-drawn quality.",
        ].join(' '),
        negativeHints: 'photograph, 3D, oil painting, watercolor, realistic',
    },

    dennou: {
        prompt: [
            "Contemporary digital art interpretation of Japanese yokai.",
            "Particle effects, subtle glitch artifacts, volumetric lighting.",
            "Dark atmospheric background with luminous focal points.",
            "Cyberpunk meets traditional Japanese mythology.",
            "High contrast, neon accents against deep shadows.",
            "Modern concept art quality, mysterious and ethereal.",
        ].join(' '),
        negativeHints: 'traditional, woodblock, ink drawing, old paper, manga',
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

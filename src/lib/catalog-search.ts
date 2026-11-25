// Local character matching: no external API or paid model calls.
export function normalizeCatalogText(value: string): string {
    return value.normalize('NFKC').toLowerCase().replace(/[ァ-ヶ]/g, char => String.fromCharCode(char.charCodeAt(0) - 0x60));
}

export function catalogScore(text: string, query: string): number {
    const terms = normalizeCatalogText(query).trim().split(/\s+/).filter(Boolean);
    if (!terms.length) return 1;
    const target = normalizeCatalogText(text);
    let score = 0;
    for (const term of terms) {
        if (target.includes(term)) { score += 1; continue; }
        if (term.length < 3) return 0;
        const pairs = new Set(Array.from({ length: term.length - 1 }, (_, i) => term.slice(i, i + 2)));
        const matched = [...pairs].filter(pair => target.includes(pair)).length / pairs.size;
        if (matched < 0.6) return 0;
        score += matched * 0.7;
    }
    return score / terms.length;
}

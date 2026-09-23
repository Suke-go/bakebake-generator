export const PUBLIC_EXPERIMENT_VERSION = 'public-explore-e5-v1';
export const PUBLIC_EXPERIMENT_MAX_BYTES = 32 * 1024;
export const PUBLIC_EXPERIMENT_DAILY_CAP = 40;

export type Grade = 0 | 1 | 2 | 3 | 'U';
export type Phase = 'initial' | 'contact' | 'foil' | 'final' | 'complete';
export type Card = {
    id: string;
    name: string;
    summary: string;
    prefecture: string;
    summarySha256: string;
};

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const HASH = /^[0-9a-f]{64}$/;

export function isObject(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function parseExperience(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const text = value.trim();
    return text.length >= 20 && text.length <= 2_000 ? text : null;
}

export function parseContact(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const text = value.trim();
    return text.length >= 3 && text.length <= 300 ? text : null;
}

export function parseGrades(cards: Card[], value: unknown): Record<string, Grade> | null {
    if (!isObject(value) || Object.keys(value).length !== cards.length) return null;
    const expected = new Set(cards.map(card => card.summarySha256));
    if (expected.size !== cards.length) return null;
    const grades: Record<string, Grade> = {};
    for (const [key, grade] of Object.entries(value)) {
        if (!HASH.test(key) || !expected.has(key) ||
            !(grade === 'U' || grade === 0 || grade === 1 || grade === 2 || grade === 3)) return null;
        grades[key] = grade;
    }
    return grades;
}

export function eligibleCards(cards: Card[], grades: Record<string, Grade>): Card[] {
    return cards.filter(card => {
        const grade = grades[card.summarySha256];
        return typeof grade === 'number' && grade >= 2;
    });
}

export function publicCards(cards: Card[]): Card[] {
    return cards.map(({ id, name, summary, prefecture, summarySha256 }) =>
        ({ id, name, summary, prefecture, summarySha256 }));
}

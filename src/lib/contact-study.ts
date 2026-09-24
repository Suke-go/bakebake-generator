export const CONTACT_STUDY_VERSION = 'contact-study-v1';
export const ACCOUNT_MIN = 60;
export const ACCOUNT_MAX = 600;

export type Grade = 0 | 1 | 2 | 3 | 'na';
export type StudyRecord = { id: string; name: string; region: string; summary: string; statement?: string };
export type Rating = {
    grade: Grade;
    where?: string;
    attribution: 'yes' | 'no' | null;
    statementValid?: 'valid' | 'partial' | 'invalid' | null;
};
export const AGE_BANDS = ['18-19', '20s', '30s', '40s', '50s', '60s', '70+', 'no_answer'] as const;
export const GENDERS = ['woman', 'man', 'other', 'no_answer'] as const;
export type Profile = {
    age: (typeof AGE_BANDS)[number];
    gender: (typeof GENDERS)[number];
    familiarity: 0 | 1 | 2 | 3;
    folkloreTraining: 'yes' | 'no';
};
export type StudyState = {
    consentAt: string;
    profile?: Profile;
    accounts: { text: string }[];
    // index of the account whose records are shown with statements; index shown first
    assignment: { withStatements: 0 | 1; firstShown: 0 | 1 };
    items?: StudyRecord[][];
    ratings?: (Record<string, Rating> | null)[];
    events: { type: string; at: string }[];
};

export function parseAccounts(v: unknown): string[] | null {
    if (!Array.isArray(v) || v.length !== 2) return null;
    const out: string[] = [];
    for (const a of v) {
        if (typeof a !== 'string') return null;
        const t = a.trim();
        if (t.length < ACCOUNT_MIN || t.length > ACCOUNT_MAX) return null;
        out.push(t);
    }
    return out;
}

export function parseRatings(v: unknown, recordIds: string[], withStatements: boolean): Record<string, Rating> | null {
    if (!v || typeof v !== 'object') return null;
    const src = v as Record<string, unknown>;
    const out: Record<string, Rating> = {};
    for (const id of recordIds) {
        const r = src[id] as Record<string, unknown> | undefined;
        if (!r || typeof r !== 'object') return null;
        const g = r.grade;
        if (!(g === 0 || g === 1 || g === 2 || g === 3 || g === 'na')) return null;
        const where = typeof r.where === 'string' ? r.where.trim().slice(0, 300) : '';
        if ((g === 2 || g === 3) && where.length === 0) return null;
        const attribution = r.attribution === 'yes' || r.attribution === 'no' ? r.attribution : null;
        let statementValid: Rating['statementValid'] = null;
        if (withStatements) {
            if (!(r.statementValid === 'valid' || r.statementValid === 'partial' || r.statementValid === 'invalid')) return null;
            statementValid = r.statementValid;
        }
        out[id] = { grade: g, where, attribution, statementValid };
    }
    return out;
}

export function parseProfile(v: unknown): Profile | null {
    if (!v || typeof v !== 'object') return null;
    const p = v as Record<string, unknown>;
    if (!(AGE_BANDS as readonly unknown[]).includes(p.age)) return null;
    if (!(GENDERS as readonly unknown[]).includes(p.gender)) return null;
    if (!(p.familiarity === 0 || p.familiarity === 1 || p.familiarity === 2 || p.familiarity === 3)) return null;
    if (!(p.folkloreTraining === 'yes' || p.folkloreTraining === 'no')) return null;
    return { age: p.age as Profile['age'], gender: p.gender as Profile['gender'], familiarity: p.familiarity, folkloreTraining: p.folkloreTraining };
}

'use client';

/**
 * The yokai a /demo participant made, kept for this browser tab so the final
 * screen can still offer it for download after the exit questions. The
 * generated image otherwise lives only as a blob URL inside the generator.
 */
export type DemoKeepsake = { name: string; image: string };

const KEY = 'demo_yokai_keepsake';

export const PROJECT_SITE_URL = 'https://bakebake.org';

export function storeDemoKeepsake(keepsake: DemoKeepsake): void {
    try { sessionStorage.setItem(KEY, JSON.stringify(keepsake)); } catch { /* too large or unavailable: the saved record is used instead */ }
}

export function loadDemoKeepsake(): DemoKeepsake | null {
    if (typeof window === 'undefined') return null;
    try {
        const parsed = JSON.parse(sessionStorage.getItem(KEY) ?? 'null') as DemoKeepsake | null;
        return parsed?.image ? parsed : null;
    } catch {
        return null;
    }
}

export function keepsakeFileName(keepsake: DemoKeepsake): string {
    const extension = /^data:image\/(png|webp)/.exec(keepsake.image)?.[1] ?? 'jpg';
    return `${keepsake.name || 'yokai'}.${extension}`;
}

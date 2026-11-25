import { normalizeCatalogText } from './catalog-search';

export type YokaiImageRecord = {
    id: string; name: string; imageUrl: string; sourceUrl: string; tags: string[];
};

// Link by a whole name or reading, never by visual tags or a fuzzy substring.
export function yokaiNameKeys(name: string): string[] {
    return [...new Set(normalizeCatalogText(name).replace(/\([^)]*\)/g, '')
        .split(/[，,、；;／/・\s]+/).map(value => value.trim()).filter(Boolean))];
}

export function buildYokaiImageIndex(records: YokaiImageRecord[]): Map<string, YokaiImageRecord[]> {
    const index = new Map<string, YokaiImageRecord[]>();
    for (const record of records) {
        // Only render links to the archive, even if a local catalog has been changed.
        const safe = [record.imageUrl, record.sourceUrl].every(value => {
            try { const url = new URL(value); return url.protocol === 'https:' && url.hostname === 'www.nichibun.ac.jp'; }
            catch { return false; }
        });
        if (!safe) continue;
        for (const key of yokaiNameKeys(record.name)) index.set(key, [...(index.get(key) ?? []), record]);
    }
    return index;
}

export function findYokaiImages(index: Map<string, YokaiImageRecord[]>, name: string, reading = ''): YokaiImageRecord[] {
    const found = new Map<string, YokaiImageRecord>();
    for (const key of yokaiNameKeys(`${name}、${reading}`)) {
        for (const record of index.get(key) ?? []) found.set(record.id, record);
    }
    return [...found.values()];
}

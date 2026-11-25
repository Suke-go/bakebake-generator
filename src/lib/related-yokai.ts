import { normalizeCatalogText } from './catalog-search';

type RecordText = { id: string | null; name: string | null; summary?: string | null; primary_image_url?: string | null };
const segmenter = new Intl.Segmenter('ja', { granularity: 'word' });
const common = new Set(['妖怪', '伝承', '記録', '俗信', '人間', '自分', '時代', '地方', '場合', '名前', '姿', 'よう', 'こと', 'もの', 'それ', 'これ']);
const cache = new WeakMap<RecordText, { name: string; body: string }>();
function text(record: RecordText) {
    let value = cache.get(record);
    if (!value) {
        value = { name: normalizeCatalogText(record.name || ''), body: normalizeCatalogText(record.summary || '') };
        cache.set(record, value);
    }
    return value;
}
function names(record: RecordText) {
    return (record.name || '').split(/[；;，,、]/).map(s => s.replace(/[（(].*?[）)]/g, '').trim()).filter(s => s && !common.has(s));
}

// Lexical connections, not inferred historical relationships or event similarity.
export function relatedYokai<T extends { properties: RecordText }>(selected: T, records: T[], limit = 4) {
    const source = text(selected.properties);
    const nameTerms = names(selected.properties);
    const bodyTerms = [...new Set([...segmenter.segment(selected.properties.summary || '')]
        .filter(s => s.isWordLike && s.segment.length >= 2 && /[一-龯ァ-ヶ]/.test(s.segment) && !common.has(s.segment))
        .map(s => s.segment))].slice(0, 32);
    const ranked = [];
    for (const feature of records) {
        const record = feature.properties;
        if (record.id === selected.properties.id) continue;
        const target = text(record);
        if (target.name === source.name && target.body === source.body && record.primary_image_url === selected.properties.primary_image_url) continue;
        const targetNames = names(record).map(normalizeCatalogText);
        const sharedNames = nameTerms.filter(term => targetNames.includes(normalizeCatalogText(term)));
        const sharedWords = bodyTerms.filter(term => target.body.includes(normalizeCatalogText(term)));
        if (!sharedNames.length && sharedWords.length < 2) continue;
        const score = sharedNames.length * 10 + sharedWords.length / Math.sqrt(Math.max(1, target.body.length / 100));
        const reason = sharedNames.length ? `同じ名前「${sharedNames[0]}」` : `本文に「${sharedWords.slice(0, 2).join('」「')}」`;
        ranked.push({ feature, reason, score });
    }
    ranked.sort((a, b) => b.score - a.score || String(a.feature.properties.id).localeCompare(String(b.feature.properties.id)));
    const seen = new Set<string>();
    const result = [];
    for (const candidate of ranked) {
        const p = candidate.feature.properties;
        const key = JSON.stringify([text(p), p.primary_image_url]);
        if (seen.has(key)) continue;
        seen.add(key);
        result.push(candidate);
        if (result.length === limit) break;
    }
    return result;
}

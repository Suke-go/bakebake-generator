// Reads the story graph built by scripts/archive-race/build_story_graph.py and
// picks the cards a player is offered at each hop.

export type StoryGraph = {
    version: string;
    /** nodes[i] lists record IDs, fullest telling first. */
    nodes: string[][];
    /** edges[i] are node indices, best first. */
    edges: number[][];
};

/**
 * The first name a record is filed under, without genre notes; mirrors name_key
 * in the graph builder. A record filed only under a note (（俗信）) gets "",
 * which offerChoices treats as matching nothing.
 */
export function nameKey(name: string): string {
    const parts = name.normalize('NFKC').replace(/[（(].*?[)）]/g, '').split(/[，,、]/).map(p => p.trim());
    return parts.find(p => p) ?? '';
}

export function nodeIndexByRecord(graph: StoryGraph): Map<string, number> {
    const index = new Map<string, number>();
    graph.nodes.forEach((ids, i) => ids.forEach(id => index.set(id, i)));
    return index;
}

/** Cards per hop. Matches OFFERED in scripts/archive-race/build_clusters.py. */
export const OFFERED_CARDS = 6;

/**
 * Up to `count` neighbours of `from`, in graph order, skipping visited nodes.
 * About a fifth of all links stay within one name (犬神 to 犬神), so at most
 * one card may share the current story's name and no two cards share a name
 * with each other. If that leaves too few cards, the rule is relaxed rather
 * than showing fewer.
 */
export function offerChoices(graph: StoryGraph, from: number, keyOf: (node: number) => string,
    visited: ReadonlySet<number> = new Set(), count = OFFERED_CARDS): number[] {
    return offerFrom(graph.edges[from].filter(j => j !== from), keyOf(from), keyOf, visited, count);
}

/**
 * offerChoices on a bare link list, for callers that fetch one story's links at a time.
 * `fill` are further similar stories that are not links: when the links hold too few
 * different names, cards come from them under the same name rule before a name may
 * repeat (mirrors offer in build_story_graph.py; outputs/archive-race/dry-runs/name_fill.py).
 */
export function offerFrom(links: readonly number[], here: string, keyOf: (node: number) => string,
    visited: ReadonlySet<number> = new Set(), count = OFFERED_CARDS, fill: readonly number[] = []): number[] {
    const open = links.filter(j => !visited.has(j));
    const picked: number[] = [];
    const used = new Set<string>();
    let sameAsHere = 0;
    for (const pool of [open, fill.filter(j => !visited.has(j))]) {
        for (const j of pool) {
            if (picked.length === count) return picked;
            if (picked.includes(j)) continue;
            const key = keyOf(j);
            const sameHere = key !== '' && key === here;
            if ((key !== '' && used.has(key)) || (sameHere && sameAsHere >= 1)) continue;
            picked.push(j);
            if (key !== '') used.add(key);
            if (sameHere) sameAsHere++;
        }
    }
    for (const j of open) {
        if (picked.length === count) break;
        if (!picked.includes(j)) picked.push(j);
    }
    return picked;
}

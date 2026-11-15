// One colour per chosen yokai (caller 0-4), shared by the queue and the map. Kept out of HyakkiMap.tsx so the
// flow can read it without pulling the map's renderer into the first bundle.
export const CALLER_COLORS = ['#ff7a7a', '#ffc857', '#5ad1e6', '#b79cff', '#7be495'];

/** The wave of lights: a light with order o ignites at o / (max order + 1) * WAVE_MS after the wave starts (the flow's counter uses the same). */
export const WAVE_MS = 10000;

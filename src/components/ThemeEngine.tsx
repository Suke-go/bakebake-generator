'use client';

import { useEffect } from 'react';
import { useApp } from '@/lib/context';

/**
 * ThemeEngine: applies CSS variable overrides to :root
 * based on art style and texture selections.
 *
 * Art style affects:
 *   - fog color (warm gray vs blue-gray vs green-tinged)
 *   - accent color
 *   - border character
 *
 * Texture affects:
 *   - overall color temperature shift
 *   - fog intensity
 */

// Art style palettes
const STYLE_THEMES = {
    sumi: {
        // Ink wash: near-monochrome, warm black, minimal color
        accent: 'hsl(0, 0%, 50%)',
        accentGlow: 'hsla(0, 0%, 50%, 0.06)',
        fogR: 0.42, fogG: 0.40, fogB: 0.38, // warm gray
        textBright: 'hsl(40, 10%, 85%)',
        textMid: 'hsl(40, 5%, 58%)',
    },
    ukiyoe: {
        // Woodblock: rich indigo accent, warm tones
        accent: 'hsl(240, 30%, 45%)',
        accentGlow: 'hsla(240, 30%, 45%, 0.08)',
        fogR: 0.44, fogG: 0.42, fogB: 0.48, // slightly purple-tinged
        textBright: 'hsl(45, 18%, 88%)',
        textMid: 'hsl(40, 10%, 62%)',
    },
    dennou: {
        // Cyber: cool blue-green, sharp
        accent: 'hsl(185, 45%, 42%)',
        accentGlow: 'hsla(185, 45%, 42%, 0.08)',
        fogR: 0.35, fogG: 0.42, fogB: 0.45, // blue-green tinted
        textBright: 'hsl(200, 15%, 88%)',
        textMid: 'hsl(200, 8%, 62%)',
    },
};

// Texture → color temperature shift
const TEXTURE_SHIFTS: Record<string, { hueShift: number; satBoost: number }> = {
    '\u51b7\u305f\u3044': { hueShift: 20, satBoost: 5 },   // cooler
    '\u91cd\u3044': { hueShift: 0, satBoost: -3 },          // darker, desaturated
    '\u306a\u3064\u304b\u3057\u3044': { hueShift: -10, satBoost: 3 },  // warmer
    '\u30c1\u30af\u30c1\u30af\u3059\u308b': { hueShift: -5, satBoost: 8 },   // sharper
    '\u6f02\u3063\u3066\u3044\u308b': { hueShift: 10, satBoost: -2 },   // diffuse
    '\u606f\u82e6\u3057\u3044': { hueShift: -15, satBoost: -5 },  // muted warm
    '\u3042\u305f\u305f\u304b\u3044': { hueShift: -20, satBoost: 6 },    // warm glow
};

export default function ThemeEngine() {
    const { state } = useApp();

    useEffect(() => {
        const root = document.documentElement;
        const style = state.artStyle;

        if (!style || !STYLE_THEMES[style]) return;

        const theme = STYLE_THEMES[style];

        // Apply art style theme
        root.style.setProperty('--accent', theme.accent);
        root.style.setProperty('--accent-glow', theme.accentGlow);
        root.style.setProperty('--text-bright', theme.textBright);
        root.style.setProperty('--text-mid', theme.textMid);

        // Store fog color for shaders (they can't read CSS vars directly,
        // but we expose them as data attributes)
        root.dataset.fogR = String(theme.fogR);
        root.dataset.fogG = String(theme.fogG);
        root.dataset.fogB = String(theme.fogB);
        root.dataset.artStyle = style;

        return () => {
            // Cleanup on unmount
            root.style.removeProperty('--accent');
            root.style.removeProperty('--accent-glow');
            root.style.removeProperty('--text-bright');
            root.style.removeProperty('--text-mid');
            delete root.dataset.fogR;
            delete root.dataset.fogG;
            delete root.dataset.fogB;
            delete root.dataset.artStyle;
        };
    }, [state.artStyle]);

    // Apply texture-based shifts
    useEffect(() => {
        const root = document.documentElement;
        const texture = state.texture;

        if (!texture) return;

        const shift = TEXTURE_SHIFTS[texture];
        if (!shift) return;

        // Shift the dim and ghost colors based on texture
        const baseHue = 40 + shift.hueShift;
        const baseSat = 5 + shift.satBoost;

        root.style.setProperty('--text-dim', `hsl(${baseHue}, ${Math.max(0, baseSat)}%, 42%)`);
        root.style.setProperty('--text-ghost', `hsl(${baseHue}, ${Math.max(0, baseSat - 2)}%, 28%)`);

        return () => {
            root.style.removeProperty('--text-dim');
            root.style.removeProperty('--text-ghost');
        };
    }, [state.texture]);

    return null; // This component has no visual output
}

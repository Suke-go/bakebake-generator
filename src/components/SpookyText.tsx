'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';

// Character pools for mojibake effect
const KANJI_POOL = '魑魅魍魎髑髏鬼幽妖怨霊闇魂呪祟禍'.split('');
const GARBLE_POOL = 'ÃçÂ¬Ã©Â¶Ã¤Â½Ã¸Ã£Ã¶ÄÃ'.split('');
const KANA_POOL = 'ア゙ヰヸヱヲ゚ヷヺ'.split('');
const ALL_GLITCH = [...KANJI_POOL, ...GARBLE_POOL, ...KANA_POOL];

function pickRandom<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
}

interface MojibakeOptions {
    resolveSpeed?: number; // ms per character resolve (default: 80)
    flickerRate?: number;  // ms between glitch updates (default: 50)
    intensity?: number;    // 0-1, portion of chars that start glitched (default: 1)
    delay?: number;        // ms before starting resolve (default: 200)
}

/**
 * useMojibake — scrambles text then resolves character by character
 * Returns the current display string and a boolean for whether it's resolved.
 */
function useMojibake(
    text: string,
    enabled: boolean,
    options: MojibakeOptions = {}
): { display: string; resolved: boolean } {
    const {
        resolveSpeed = 80,
        flickerRate = 50,
        intensity = 1,
        delay = 200,
    } = options;

    const chars = useMemo(() => text.split(''), [text]);
    const [resolvedCount, setResolvedCount] = useState(enabled ? 0 : chars.length);
    const [glitchChars, setGlitchChars] = useState<string[]>([]);
    const rafRef = useRef(0);
    const lastResolveRef = useRef(0);
    const lastFlickerRef = useRef(0);
    const startedRef = useRef(false);
    const startTimeRef = useRef(0);

    // Reset when text or enabled changes
    useEffect(() => {
        if (!enabled) {
            setResolvedCount(chars.length);
            setGlitchChars([]);
            return;
        }

        startedRef.current = false;
        startTimeRef.current = performance.now();
        setResolvedCount(0);

        // Initialize glitch characters
        const initial = chars.map((c, i) => {
            if (c === ' ' || c === '\n') return c;
            return Math.random() < intensity ? pickRandom(ALL_GLITCH) : c;
        });
        setGlitchChars(initial);
    }, [text, enabled, chars, intensity]);

    useEffect(() => {
        if (!enabled || resolvedCount >= chars.length) return;

        const animate = (now: number) => {
            // Wait for delay before starting resolve
            if (!startedRef.current) {
                if (now - startTimeRef.current < delay) {
                    // Still in delay phase — flicker unresolved chars
                    if (now - lastFlickerRef.current > flickerRate) {
                        lastFlickerRef.current = now;
                        setGlitchChars(prev => prev.map((c, i) => {
                            if (i < resolvedCount) return chars[i];
                            if (chars[i] === ' ' || chars[i] === '\n') return chars[i];
                            return pickRandom(ALL_GLITCH);
                        }));
                    }
                    rafRef.current = requestAnimationFrame(animate);
                    return;
                }
                startedRef.current = true;
                lastResolveRef.current = now;
            }

            // Flicker unresolved characters
            if (now - lastFlickerRef.current > flickerRate) {
                lastFlickerRef.current = now;
                setGlitchChars(prev => prev.map((c, i) => {
                    if (i < resolvedCount) return chars[i];
                    if (chars[i] === ' ' || chars[i] === '\n') return chars[i];
                    return pickRandom(ALL_GLITCH);
                }));
            }

            // Resolve next character
            if (now - lastResolveRef.current > resolveSpeed) {
                lastResolveRef.current = now;
                setResolvedCount(prev => {
                    let next = prev + 1;
                    // Skip spaces
                    while (next < chars.length && (chars[next] === ' ' || chars[next] === '\n')) {
                        next++;
                    }
                    return next;
                });
            }

            rafRef.current = requestAnimationFrame(animate);
        };

        rafRef.current = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(rafRef.current);
    }, [enabled, resolvedCount, chars, resolveSpeed, flickerRate, delay]);

    const display = useMemo(() => {
        if (!enabled || resolvedCount >= chars.length) return text;
        return glitchChars.map((c, i) => (i < resolvedCount ? chars[i] : c)).join('');
    }, [enabled, resolvedCount, chars, glitchChars, text]);

    return {
        display,
        resolved: resolvedCount >= chars.length,
    };
}

// --- SpookyText component ---

interface SpookyTextProps {
    text: string;
    as?: keyof HTMLElementTagNameMap;
    className?: string;
    style?: React.CSSProperties;
    mojibake?: boolean;
    mojibakeOptions?: MojibakeOptions;
    charAnimation?: boolean;
    charDelayStep?: number; // ms between each char's animation-delay (default: 60)
}

export default function SpookyText({
    text,
    as: Tag = 'span' as any,
    className = '',
    style,
    mojibake = false,
    mojibakeOptions,
    charAnimation = false,
    charDelayStep = 60,
}: SpookyTextProps) {
    const { display, resolved } = useMojibake(text, mojibake, mojibakeOptions);

    // Reduce motion check
    const [reducedMotion, setReducedMotion] = useState(false);
    useEffect(() => {
        const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
        setReducedMotion(mq.matches);
        const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
        mq.addEventListener('change', handler);
        return () => mq.removeEventListener('change', handler);
    }, []);

    // If no character animation, render as simple text
    if (!charAnimation || reducedMotion) {
        return (
            <Tag className={className} style={style}>
                {display}
            </Tag>
        );
    }

    // Per-character wrapping with staggered animation
    const displayChars = display.split('');

    return (
        <Tag className={className} style={style}>
            {displayChars.map((char, i) => {
                if (char === ' ') return ' ';
                return (
                    <span
                        key={`${i}-${char}`}
                        className="spooky-char"
                        style={{
                            animationDelay: `${i * charDelayStep}ms`,
                        }}
                    >
                        {char}
                    </span>
                );
            })}
        </Tag>
    );
}

export { useMojibake };

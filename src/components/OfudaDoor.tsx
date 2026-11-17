'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './OfudaDoor.module.css';

type DoorPhase = 'sealed' | 'lit' | 'released' | 'open' | 'through';

// How long each phase is held before the next one begins.
const SEQUENCE: Array<[DoorPhase, number]> = [
    ['lit', 0],
    ['released', 800],
    ['open', 1500],
    ['through', 3600],
];
const DONE_AT_MS = 4700;

/**
 * A sealed door held shut by the participant's ofuda. Touching the ofuda
 * breaks the seal, the doors swing inward, and the view passes through.
 */
export default function OfudaDoor({ isEnglish, onOpened, onStartAsSomeoneElse }: {
    isEnglish: boolean;
    onOpened: () => void;
    /** Shown only when this device already holds an ofuda from an earlier visit. */
    onStartAsSomeoneElse?: () => void;
}) {
    const [phase, setPhase] = useState<DoorPhase>('sealed');
    const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
    const onOpenedRef = useRef(onOpened);
    useEffect(() => { onOpenedRef.current = onOpened; }, [onOpened]);

    useEffect(() => {
        const timers = timersRef;
        return () => timers.current.forEach(clearTimeout);
    }, []);

    const breakSeal = () => {
        if (phase !== 'sealed') return;
        try { navigator.vibrate?.(30); } catch { /* not supported */ }
        timersRef.current = [
            ...SEQUENCE.map(([next, at]) => setTimeout(() => setPhase(next), at)),
            setTimeout(() => onOpenedRef.current(), DONE_AT_MS),
        ];
    };

    return (
        <div className={styles.scene} data-phase={phase} data-yokai-zone="demo-door">
            <div className={styles.beyond} />
            <div className={styles.doors}>
                <div className={`${styles.leaf} ${styles.left}`} />
                <div className={`${styles.leaf} ${styles.right}`} />
            </div>
            <div className={styles.seam} />
            <p className={styles.caption}>
                {isEnglish ? 'You have been given an ofuda.' : 'お札を授かりました'}
            </p>
            <button
                type="button"
                className={styles.ofuda}
                onClick={breakSeal}
                aria-label={isEnglish ? 'Touch the ofuda to open the door' : 'お札に触れて扉を開く'}
            />
            <p className={styles.hint}>
                {isEnglish ? <>Touch the ofuda<br />to open the door.</> : <>お札に触れると<br />扉が開きます</>}
            </p>
            {onStartAsSomeoneElse && (
                <button type="button" className={styles.other} onClick={onStartAsSomeoneElse}>
                    {isEnglish ? 'Someone else is starting on this phone' : 'この端末で別の方がはじめる'}
                </button>
            )}
            <div className={styles.veil} />
        </div>
    );
}

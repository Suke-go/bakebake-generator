"use client";

// A thin wrapper around the Cesium viewer in /hyakki-view/ (same shape as YokaiCityView): the iframe isolates
// Cesium from the Next app, and every prop reaches it by postMessage only when that prop changes.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { HyakkiMapProps, RegionKey } from '@/lib/hyakki-types';
import { CALLER_COLORS, WAVE_MS } from './colors';

const SRC = '/hyakki-view/index.html';
const SEA = '#0b0818'; // same as --hk-sea in public/hyakki-view/viewer.css

type Failure = { title: string; reason: string };

const FAILURES: Record<string, Failure> = {
    webgl: { title: '地図を表示できません', reason: 'この端末では、地図を動かすしくみ(WebGL)が使えないようです。ブラウザを新しくするか、ほかの端末でためしてください。' },
    cesium: { title: '地図を読みこめません', reason: '地図のプログラムを取得できませんでした。通信をたしかめて、もう一度ためしてください。' },
    data: { title: '地図のデータを読みこめません', reason: '通信がうまくいかなかったようです。つながっているかたしかめて、もう一度ためしてください。' },
    other: { title: '地図を表示できません', reason: '地図の表示で問題がおきました。もう一度ためしてください。' },
    timeout: { title: '地図を読みこめません', reason: '時間がかかりすぎています。通信をたしかめて、もう一度ためしてください。' },
};

export default function HyakkiMap(props: HyakkiMapProps) {
    const { view, pin, mists, peeked, figures, called, sheet, lights, summon, parade, still, onRegion, onPick, onMist, onFigure, onSummoned, onParaded } = props;
    // Handlers change identity on every render of the flow; only whether they exist matters to the viewer.
    const hasRegion = !!onRegion, hasPick = !!onPick, hasMist = !!onMist, hasFigure = !!onFigure;
    const host = useRef<HTMLDivElement>(null);
    const frame = useRef<HTMLIFrameElement>(null);
    const [ready, setReady] = useState(false);
    const [failure, setFailure] = useState<Failure | null>(null);
    const [tilesTrouble, setTilesTrouble] = useState(false);
    const [attempt, setAttempt] = useState(0);

    // Callbacks live in a ref so the message listener never has to be re-attached.
    const cb = useRef({ onRegion, onPick, onMist, onFigure, onSummoned, onParaded });
    useEffect(() => { cb.current = { onRegion, onPick, onMist, onFigure, onSummoned, onParaded }; });

    const post = useCallback((key: string, value: unknown) => {
        frame.current?.contentWindow?.postMessage({ type: 'hyakki-set', key, value }, window.location.origin);
    }, []);

    useEffect(() => {
        const timeout = window.setTimeout(() => setFailure((f) => f ?? FAILURES.timeout), 30000);
        const receive = (event: MessageEvent) => {
            if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow) return;
            const d = event.data as { type?: string; region?: RegionKey; lat?: number; lon?: number; id?: string; code?: string; index?: number };
            switch (d?.type) {
                case 'hyakki-ready': window.clearTimeout(timeout); setReady(true); setFailure(null); break;
                case 'hyakki-error': window.clearTimeout(timeout); setFailure(FAILURES[d.code ?? 'other'] ?? FAILURES.other); break;
                case 'hyakki-tiles-trouble': setTilesTrouble(true); break;
                case 'hyakki-region': if (d.region) cb.current.onRegion?.(d.region); break;
                case 'hyakki-pick': if (typeof d.lat === 'number' && typeof d.lon === 'number') cb.current.onPick?.({ lat: d.lat, lon: d.lon }); break;
                case 'hyakki-mist': if (typeof d.id === 'string') cb.current.onMist?.(d.id); break;
                case 'hyakki-figure': if (typeof d.index === 'number') cb.current.onFigure?.(d.index); break;
                case 'hyakki-summoned': cb.current.onSummoned?.(); break;
                case 'hyakki-paraded': cb.current.onParaded?.(); break;
            }
        };
        window.addEventListener('message', receive);
        // The iframe may finish loading before React hydrates the server-rendered page.
        frame.current?.contentWindow?.postMessage({ type: 'hyakki-init' }, window.location.origin);
        return () => { window.clearTimeout(timeout); window.removeEventListener('message', receive); };
    }, [attempt]);

    // Each prop goes over only when it changes (and once when the viewer becomes ready). `still` goes first so the
    // first view is placed without a flight, and `view` goes before anything that needs the camera.
    useEffect(() => { if (ready) post('config', { callerColors: CALLER_COLORS, waveMs: WAVE_MS }); }, [ready, post]);
    useEffect(() => { if (ready) post('still', !!still); }, [ready, still, post]);
    useEffect(() => { if (ready) post('handlers', { region: hasRegion, pick: hasPick, mist: hasMist, figure: hasFigure }); }, [ready, hasRegion, hasPick, hasMist, hasFigure, post]);
    useEffect(() => { if (ready) post('view', view); }, [ready, view, post]);
    useEffect(() => { if (ready) post('pin', pin ?? null); }, [ready, pin, post]);
    useEffect(() => { if (ready) post('mists', mists ?? []); }, [ready, mists, post]);
    useEffect(() => { if (ready) post('figures', figures ?? []); }, [ready, figures, post]);
    useEffect(() => { if (ready) post('lights', lights ?? []); }, [ready, lights, post]);
    useEffect(() => { if (ready) post('summon', summon ?? 'off'); }, [ready, summon, post]);
    useEffect(() => { if (ready) post('parade', !!parade); }, [ready, parade, post]);
    useEffect(() => { if (ready) post('peeked', peeked ?? []); }, [ready, peeked, post]);
    useEffect(() => { if (ready) post('called', called ?? []); }, [ready, called, post]);
    useEffect(() => { if (ready) post('sheet', !!sheet); }, [ready, sheet, post]);

    // The screen's bottom panel hides part of the map; it publishes its height as --hyakki-map-inset-bottom (a style
    // attribute on an ancestor), so a MutationObserver on the ancestors is enough: no polling.
    useEffect(() => {
        if (!ready) return;
        let sent = -1;
        const read = () => {
            const el = host.current;
            if (!el) return;
            const v = parseFloat(getComputedStyle(el).getPropertyValue('--hyakki-map-inset-bottom'));
            const px = Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0;
            if (px !== sent) { sent = px; post('inset', px); }
        };
        read();
        const observer = new MutationObserver(read);
        for (let el: HTMLElement | null = host.current; el; el = el.parentElement) observer.observe(el, { attributes: true, attributeFilter: ['style', 'class'] });
        return () => observer.disconnect();
    }, [ready, post]);

    const retry = () => { setReady(false); setFailure(null); setTilesTrouble(false); setAttempt((a) => a + 1); };

    return (
        <div ref={host} style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: SEA }}>
            <iframe
                key={attempt} ref={frame} src={SRC} title="百鬼夜行の地図"
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0, touchAction: 'none' }}
                onLoad={() => frame.current?.contentWindow?.postMessage({ type: 'hyakki-init' }, window.location.origin)}
            />
            {tilesTrouble && !failure && (
                <p role="status" style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', maxWidth: 'calc(100% - 16px)', top: 60, margin: 0, padding: '6px 10px', borderRadius: 8, fontSize: 14, color: '#e8eeff', background: 'rgba(20,26,50,0.85)', pointerEvents: 'none' }}>
                    地図の一部を読みこめていません。通信をたしかめてください。
                </p>
            )}
            {failure && (
                <div role="alert" style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: '72px 24px 24px', textAlign: 'center', color: '#e8eeff', background: SEA }}>
                    <p style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>{failure.title}</p>
                    <p style={{ margin: 0, fontSize: 16, lineHeight: 1.7, maxWidth: 360 }}>{failure.reason}</p>
                    <button type="button" onClick={retry} style={{ minHeight: 48, padding: '0 28px', fontSize: 18, fontWeight: 700, color: '#241a3c', background: '#efe6fb', border: '1px solid #4a3a78', borderRadius: 4, cursor: 'pointer' }}>
                        もう一度ためす
                    </button>
                </div>
            )}
        </div>
    );
}

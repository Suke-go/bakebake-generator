'use client';

import { PLAY_CONSENT_VERSION, MAX_EVENTS_PER_BATCH, MAX_SEQ, type PlayMode } from './play-log-contract';

type QueuedEvent = { eventId: string; seq: number; eventType: string; occurredAt: string; elapsedMs: number; payload: Record<string, unknown> };

// Buffers play events and sends them in batches. Logging failures never block
// play: if the session cannot be opened, every later call is a no-op.
export class PlayLogger {
    private queue: QueuedEvent[] = [];
    private seq = 0;
    private readonly startedAt = performance.now();
    private session: { id: string; token: string } | null = null;
    private disabled = false;
    private flushing: Promise<void> | null = null;
    private timer: ReturnType<typeof setInterval> | null = null;
    private readonly onHide = () => { if (document.visibilityState === 'hidden') void this.flush(true); };

    private ready: Promise<void> = Promise.resolve();

    private constructor() {}

    static start(mode: PlayMode, locale: 'ja' | 'en' = 'ja'): PlayLogger {
        const logger = new PlayLogger();
        logger.ready = fetch('/api/play-session', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ consentAccepted: true, consentVersion: PLAY_CONSENT_VERSION, mode, locale }),
        }).then(async response => {
            const data = await response.json().catch(() => ({}));
            if (!response.ok || typeof data.sessionId !== 'string' || typeof data.token !== 'string') throw new Error('play logging disabled');
            logger.session = { id: data.sessionId, token: data.token };
        }).catch(() => { logger.disabled = true; logger.queue = []; });
        logger.timer = setInterval(() => void logger.flush(), 5000);
        document.addEventListener('visibilitychange', logger.onHide);
        return logger;
    }

    log(eventType: string, payload: Record<string, unknown>): void {
        if (this.disabled || this.seq > MAX_SEQ) return;
        this.queue.push({
            eventId: crypto.randomUUID(), seq: this.seq++, eventType,
            occurredAt: new Date().toISOString(), elapsedMs: Math.round(performance.now() - this.startedAt), payload,
        });
        if (this.queue.length >= 20) void this.flush();
    }

    /** Milliseconds since this play session started (for dwell times). */
    now(): number { return performance.now() - this.startedAt; }

    async flush(keepalive = false): Promise<void> {
        if (this.flushing) await this.flushing;
        await this.ready;
        if (this.disabled || !this.session || !this.queue.length) return;
        const batch = this.queue.slice(0, MAX_EVENTS_PER_BATCH);
        const session = this.session;
        let sent = false;
        this.flushing = fetch('/api/play-log', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive,
            body: JSON.stringify({ sessionId: session.id, token: session.token, events: batch }),
        }).then(response => {
            if (response.ok) { this.queue = this.queue.slice(batch.length); sent = true; }
            // A rejected batch will never validate; drop it so later events still go out.
            else if (response.status === 400 || response.status === 413) this.queue = this.queue.slice(batch.length);
            else if (response.status === 403) { this.disabled = true; this.queue = []; }
        }).catch(() => { /* keep the batch for the next timer tick */ }).finally(() => { this.flushing = null; });
        await this.flushing;
        if (sent && this.queue.length && !this.disabled) await this.flush(keepalive);
    }

    /** Sends what is left and stops the timers. */
    close(): void {
        if (this.timer) clearInterval(this.timer);
        document.removeEventListener('visibilitychange', this.onHide);
        void this.flush(true);
    }
}

'use client';

const tokenKey = (ticketId: string) => `research_log_token:${ticketId}`;
const errorEventName = 'research-log-error';

export function storeResearchToken(ticketId: string, token: string, persistent = false): void {
    if (typeof window === 'undefined' || !ticketId || !token) return;
    window.sessionStorage.setItem(tokenKey(ticketId), token);
    if (persistent) window.localStorage.setItem(tokenKey(ticketId), token);
}

export function getResearchToken(ticketId: string | null): string | null {
    if (typeof window === 'undefined' || !ticketId) return null;
    return window.sessionStorage.getItem(tokenKey(ticketId)) || window.localStorage.getItem(tokenKey(ticketId));
}

export function importResearchTokenFromHash(ticketId: string | null): void {
    if (typeof window === 'undefined' || !ticketId) return;
    const token = new URLSearchParams(window.location.hash.slice(1)).get('rt');
    if (token) storeResearchToken(ticketId, token);
}

export type ResearchEvent = {
    eventId?: string;
    eventType: string;
    occurredAt?: string;
    payload: Record<string, unknown>;
};

export async function logResearchEvent(ticketId: string | null, event: ResearchEvent): Promise<boolean> {
    const token = getResearchToken(ticketId);
    if (!ticketId || !token) return false;
    try {
        const body = JSON.stringify({
            ticketId,
            token,
            event: {
                eventId: event.eventId ?? crypto.randomUUID(),
                eventType: event.eventType,
                occurredAt: event.occurredAt ?? new Date().toISOString(),
                payload: event.payload,
            },
        });
        const response = await fetch('/api/research-log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            // Browsers limit keepalive bodies to about 64 KiB. Large archive
            // snapshots still save during the active interaction without it.
            keepalive: new Blob([body]).size <= 60 * 1024,
            body,
        });
        if (!response.ok) throw new Error(`research log request failed (${response.status})`);
        return true;
    } catch (error) {
        console.warn('Research log was not saved:', error);
        window.dispatchEvent(new CustomEvent(errorEventName));
        return false;
    }
}

export function subscribeResearchLogErrors(onError: () => void): () => void {
    if (typeof window === 'undefined') return () => {};
    window.addEventListener(errorEventName, onError);
    return () => window.removeEventListener(errorEventName, onError);
}

export async function sha256Hex(value: string): Promise<string> {
    const bytes = new TextEncoder().encode(value);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

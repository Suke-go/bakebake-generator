import { createHash, timingSafeEqual } from 'crypto';
import { createClient } from '@supabase/supabase-js';

export function getResearchSupabase() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceRoleKey) return null;
    return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function hashResearchToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
}

export function matchesResearchToken(token: string, expectedHash: string): boolean {
    const actual = Buffer.from(hashResearchToken(token), 'hex');
    const expected = Buffer.from(expectedHash, 'hex');
    return actual.length === expected.length && timingSafeEqual(actual, expected);
}

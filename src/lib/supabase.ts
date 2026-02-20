import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let _supabase: SupabaseClient;

if (supabaseUrl && supabaseAnonKey) {
    _supabase = createClient(supabaseUrl, supabaseAnonKey);
} else {
    // ビルド時や環境変数未設定時はダミークライアントで安全に通過
    console.warn(
        '[supabase] Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. ' +
        'Supabase features will be unavailable.'
    );
    _supabase = new Proxy({} as SupabaseClient, {
        get: (_target, prop) => {
            if (prop === 'from') {
                return () => ({
                    select: () => Promise.resolve({ data: null, error: new Error('Supabase not configured') }),
                    insert: () => Promise.resolve({ data: null, error: new Error('Supabase not configured') }),
                    update: () => ({ eq: () => Promise.resolve({ data: null, error: new Error('Supabase not configured') }) }),
                    delete: () => ({ eq: () => Promise.resolve({ data: null, error: new Error('Supabase not configured') }) }),
                });
            }
            if (prop === 'channel') {
                return () => ({
                    on: () => ({ subscribe: () => ({}) }),
                });
            }
            if (prop === 'removeChannel') {
                return () => { };
            }
            return undefined;
        },
    });
}

export const supabase = _supabase;

import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Supabase クライアント（ブラウザ + サーバー共用）
 *
 * NEXT_PUBLIC_SUPABASE_ANON_KEY は設計上の公開キーであり、セキュリティは
 * Supabase ダッシュボードの Row Level Security (RLS) ポリシーに依存します。
 * surveys テーブルには INSERT / UPDATE（自行のみ）の RLS が設定されていることを
 * 展示前に必ず確認してください。
 */
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

import { NextResponse } from 'next/server';

/**
 * ID/パスワード認証エンドポイント
 * ADMIN_ID / ADMIN_PASS 環境変数と照合し、一致すれば httpOnly cookie をセット
 */
export async function POST(req: Request) {
    try {
        const { id, password } = await req.json();

        const correctId = process.env.ADMIN_ID;
        const correctPass = process.env.ADMIN_PASS;

        if (!correctId || !correctPass) {
            console.error('ADMIN_ID / ADMIN_PASS is not configured');
            return NextResponse.json(
                { error: 'Server configuration error' },
                { status: 500 }
            );
        }

        if (id !== correctId || password !== correctPass) {
            return NextResponse.json(
                { error: 'IDまたはパスワードが正しくありません' },
                { status: 401 }
            );
        }

        const res = NextResponse.json({ ok: true });
        res.cookies.set('yokai-auth', 'granted', {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            path: '/',
            maxAge: 60 * 60 * 24,  // 24 hours
        });
        return res;
    } catch {
        return NextResponse.json(
            { error: 'Invalid request' },
            { status: 400 }
        );
    }
}

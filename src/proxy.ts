import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function proxy(req: NextRequest) {
    // Only protect /generator and /admin paths
    const url = req.nextUrl.pathname;
    if (!url.startsWith('/generator') && !url.startsWith('/admin')) {
        return NextResponse.next();
    }

    const basicAuth = req.headers.get('authorization');

    if (basicAuth) {
        const authValue = basicAuth.split(' ')[1];
        const [user, pwd] = atob(authValue).split(':');

        // Simple auth for the exhibition
        const expectedUser = process.env.ADMIN_USER || 'yokai';
        const expectedPwd = process.env.ADMIN_PASSWORD || 'bakebake';

        if (user === expectedUser && pwd === expectedPwd) {
            return NextResponse.next();
        }
    }

    return new NextResponse('Auth Required', {
        status: 401,
        headers: {
            'WWW-Authenticate': 'Basic realm="Secure Area"',
        },
    });
}

// Config to limit middleware to specific paths
export const config = {
    matcher: ['/generator/:path*', '/admin/:path*'],
};

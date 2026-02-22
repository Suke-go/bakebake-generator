import { NextRequest, NextResponse } from 'next/server';

/**
 * PIN-based protection for /admin and /generator routes.
 * Checks for a valid auth cookie; redirects to /auth if missing.
 */
const PROTECTED_PATHS = ['/admin', '/generator'];

export function proxy(req: NextRequest) {
    const { pathname } = req.nextUrl;

    // Only protect specific paths
    const isProtected = PROTECTED_PATHS.some(
        (p) => pathname === p || pathname.startsWith(p + '/')
    );
    if (!isProtected) return NextResponse.next();

    // Check auth cookie
    const authCookie = req.cookies.get('yokai-auth');
    if (authCookie?.value === 'granted') {
        return NextResponse.next();
    }

    // Redirect to auth page with return URL
    const authUrl = req.nextUrl.clone();
    authUrl.pathname = '/auth';
    authUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(authUrl);
}

export const config = {
    matcher: ['/admin/:path*', '/generator/:path*'],
};

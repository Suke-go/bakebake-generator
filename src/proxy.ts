import { NextRequest, NextResponse } from 'next/server';

/**
 * PIN-based protection for /admin and /generator routes.
 * Checks for a valid auth cookie; redirects to /auth if missing.
 *
 * /collection is a public gallery of the yokai people have made. Only its
 * staff view (/collection?staff=1), which adds the survey answers, is protected.
 */
const PROTECTED_PATHS = ['/admin', '/generator'];
const STAFF_VIEW_PATH = '/collection';

export function proxy(req: NextRequest) {
    const { pathname } = req.nextUrl;

    // Only protect specific paths
    const isProtected = PROTECTED_PATHS.some(
        (p) => pathname === p || pathname.startsWith(p + '/')
    );
    const isStaffView = (pathname === STAFF_VIEW_PATH || pathname.startsWith(STAFF_VIEW_PATH + '/'))
        && req.nextUrl.searchParams.has('staff');
    if (!isProtected && !isStaffView) return NextResponse.next();

    // Check auth cookie
    const authCookie = req.cookies.get('yokai-auth');
    if (authCookie?.value === 'granted') {
        return NextResponse.next();
    }

    // Redirect to auth page with return URL
    const authUrl = req.nextUrl.clone();
    authUrl.pathname = '/auth';
    authUrl.searchParams.set('next', `${pathname}${req.nextUrl.search}`);
    return NextResponse.redirect(authUrl);
}

export const config = {
    matcher: ['/admin/:path*', '/generator/:path*', '/collection/:path*'],
};

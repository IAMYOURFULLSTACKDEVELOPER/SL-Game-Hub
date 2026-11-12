import { convexAuthNextjsMiddleware, createRouteMatcher } from '@convex-dev/auth/nextjs/server';
import { NextResponse } from 'next/server';

const isPrivate = createRouteMatcher(['/admin(.*)', '/profile(.*)', '/wallet(.*)']);

// Serves /api/auth (sign in/out), refreshes the auth cookie, and gates private routes.
// Admin ROLE is re-checked in the admin layout, and enforced for data by the Convex functions.
export default convexAuthNextjsMiddleware(async (req, { convexAuth }) => {
  if (isPrivate(req) && !(await convexAuth.isAuthenticated())) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.search = `?next=${encodeURIComponent(req.nextUrl.pathname)}`;
    return NextResponse.redirect(url);
  }
});

// Everything except static files and Next.js internals.
export const config = { matcher: ['/((?!.*\\..*|_next).*)', '/', '/(api|trpc)(.*)'] };

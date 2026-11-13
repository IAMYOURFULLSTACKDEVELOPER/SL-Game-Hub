/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@slgh/shared', '@slgh/backend'],
  poweredByHeader: false,
  compress: true,
  async headers() {
    return [{
      // The service worker must never be served stale, or players get stuck on an old version.
      source: '/sw.js',
      headers: [
        { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
        { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
      ],
    }, {
      source: '/(.*)',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        // Microphone only for our own pages (voice chat in online game rooms); never for anything embedded.
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(self), geolocation=()' },
      ],
    }];
  },
};
export default nextConfig;

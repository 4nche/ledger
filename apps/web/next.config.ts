import type { NextConfig } from 'next';

/**
 * Workspace packages ship as TypeScript source rather than build output, so
 * Next has to compile them itself. `domain` is imported by the browser for the
 * live PnL preview — display only; the API recalculates on save.
 */
const nextConfig: NextConfig = {
  transpilePackages: ['@journal/contracts', '@journal/domain'],

  /**
   * Proxy the API under the web app's own origin. Same-origin requests mean no
   * CORS preflights in development and no origin juggling when cookies arrive
   * with authentication later.
   */
  async rewrites() {
    const apiBaseUrl = process.env['API_BASE_URL'] ?? 'http://127.0.0.1:4000';
    return [
      // Auth routes keep their /api/auth prefix, because that is the path Google
      // was told to redirect to and the path the cookie is scoped to. Order
      // matters: this must match before the general rule strips the prefix.
      { source: '/api/auth/:path*', destination: `${apiBaseUrl}/api/auth/:path*` },
      { source: '/api/:path*', destination: `${apiBaseUrl}/:path*` },
    ];
  },
};

export default nextConfig;

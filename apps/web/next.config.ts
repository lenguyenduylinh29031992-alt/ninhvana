import type { NextConfig } from 'next';
import path from 'node:path';

const API_INTERNAL_URL = process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:4000';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  // Include workspace packages in the standalone trace for Docker images.
  outputFileTracingRoot: path.join(process.cwd(), '../../'),
  poweredByHeader: false,
  eslint: { ignoreDuringBuilds: true },
  async rewrites() {
    return [
      // Same-origin proxy: cookies set by the API remain first-party, CSRF stays simple.
      { source: '/api/:path*', destination: `${API_INTERNAL_URL}/api/:path*` },
    ];
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(self), geolocation=(self), microphone=(self)',
          },
        ],
      },
    ];
  },
};

export default nextConfig;

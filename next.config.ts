import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typedRoutes: false,
  // PGlite ships a WASM binary that must not be bundled into the server build.
  serverExternalPackages: ['@electric-sql/pglite'],
  experimental: {
    // Hosted file bytes go directly to private Blob. Local database uploads
    // retain the three-file allowance without Vercel's request payload limit.
    serverActions: { bodySizeLimit: process.env.VERCEL ? '1mb' : '17mb' },
  },
};

export default nextConfig;

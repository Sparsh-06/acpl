import type { NextConfig } from 'next';

// The browser only ever talks to this Next.js server ("/api/*"), which proxies to the
// Express API. Benefits: same-origin cookies, no CORS, and the API URL is never shipped
// to the client. API_URL is a server-side variable (no NEXT_PUBLIC_ prefix).
const apiUrl = process.env.API_URL ?? 'http://localhost:4000';

const nextConfig: NextConfig = {
  output: 'standalone',
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${apiUrl}/api/:path*` }];
  },
};

export default nextConfig;

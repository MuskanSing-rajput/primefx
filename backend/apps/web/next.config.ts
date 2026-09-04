import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Dedicated asset prefix to prevent collision with landing page _next static assets
  assetPrefix: '/_lp_next',

  // Remove X-Powered-By header
  poweredByHeader: false,

  eslint: {
    ignoreDuringBuilds: true,
  },

  // Security headers
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://static.cloudflareinsights.com",
              "script-src-elem 'self' 'unsafe-inline' https://static.cloudflareinsights.com",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com data:",
              "img-src 'self' data: https: blob:",
              "connect-src 'self' ws: wss: http: https: https://cloudflareinsights.com",
              "frame-ancestors 'none'",
              "object-src 'none'",
            ].join('; '),
          },
        ],
      },
    ]
  },

  // Redirect rules
  async redirects() {
    return [
      {
        source: '/admin',
        destination: '/admin/dashboard',
        permanent: true,
      },
      {
        source: '/broker',
        destination: '/broker/dashboard',
        permanent: true,
      },
    ]
  },

  // Webpack path aliases for shared packages
  webpack(config) {
    return config
  },

  // Experimental features
  experimental: {
    optimizePackageImports: ['react-icons'],
  },
}

export default nextConfig

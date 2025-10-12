// next.config.ts
import type { NextConfig } from 'next'

function normalizeBase(u: string) {
  const trimmed = u.trim().replace(/\/+$/, '') // 末尾 /
  return trimmed.replace(/\/+$/,'')
}

const rawBackendBase =
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  process.env.NEXT_PUBLIC_API_BASE ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  'http://127.0.0.1:8000'

const backendBase = normalizeBase(rawBackendBase)

const nextConfig: NextConfig = {
  output: 'standalone',
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },

  async rewrites() {
    // 念のため http/https のみ許可
    const enableProxy = /^https?:\/\//i.test(backendBase)
    return enableProxy
      ? [{ source: '/api/:path*', destination: `${backendBase}/api/:path*` }]
      : []
  },
}

export default nextConfig

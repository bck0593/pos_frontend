import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  // ビルドは通す（型/ESLintはCIで済ませる想定）
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;

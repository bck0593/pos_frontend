import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  turbopack: {
    // Pin the workspace root so Turbopack ignores lockfiles outside this project.
    root: __dirname,
  },
};

export default nextConfig;

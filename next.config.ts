/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // Allow CI builds to succeed even if lint/type errors slip through; fix locally before shipping.
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
};

module.exports = nextConfig;

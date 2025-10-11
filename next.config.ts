/** @type {import('next').NextConfig} */
const nextConfig = {
  // ← これがないと .next/standalone が出ません
  output: 'standalone',

  // 必要なら他の設定もここに
  // experimental: { ... },
  // images: { ... },
};

module.exports = nextConfig;

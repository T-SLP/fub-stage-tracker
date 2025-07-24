/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  // output: 'export',  // ← REMOVED - this was disabling API routes
  trailingSlash: true,
  images: {
    unoptimized: true
  }
}

module.exports = nextConfig
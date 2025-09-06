/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  // trailingSlash: true,  // ← REMOVED - this was causing API redirects
  images: {
    unoptimized: true
  }
}

module.exports = nextConfig
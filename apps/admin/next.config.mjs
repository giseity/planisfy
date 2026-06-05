/* global process */

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  transpilePackages: ["@planisfy/ui", "@planisfy/auth", "@planisfy/events"],
  async rewrites() {
    const api = process.env.API_URL || "https://api.planisfy.localhost"
    return [
      {
        source: "/api/auth/:path*",
        destination: `${api}/api/auth/:path*`,
      },
      {
        source: "/api/v1/:path*",
        destination: `${api}/:path*`,
      },
    ]
  },
}

export default nextConfig

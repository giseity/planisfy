/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@planisfy/ui", "@planisfy/auth"],
  async rewrites() {
    const api = process.env.API_URL || "http://localhost:4000"
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

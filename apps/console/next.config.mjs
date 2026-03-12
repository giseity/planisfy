/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@planisfy/ui", "@planisfy/auth"],
  async rewrites() {
    return [
      {
        // Proxy API calls to the Hono API server in development.
        // This avoids cross-origin cookie issues (console :3001 → api :4000).
        source: "/api/v1/:path*",
        destination: `${process.env.API_URL || "http://localhost:4000"}/:path*`,
      },
    ]
  },
}

export default nextConfig

/* global process */

import { loadWorkspaceEnvForNextConfig } from "../../packages/env/next-config.mjs"

loadWorkspaceEnvForNextConfig()

/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ["admin.planisfy.localhost"],
  output: "standalone",
  transpilePackages: ["@planisfy/ui", "@planisfy/auth", "@planisfy/events"],
  async rewrites() {
    const api = process.env.NEXT_PUBLIC_API_URL
    if (!api) throw new Error("NEXT_PUBLIC_API_URL is required.")
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

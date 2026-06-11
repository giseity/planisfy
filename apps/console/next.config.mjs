/* global process */

import { loadWorkspaceEnvForNextConfig } from "../../packages/env/next-config.mjs"

loadWorkspaceEnvForNextConfig()

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  transpilePackages: ["@planisfy/ui", "@planisfy/auth"],
  async rewrites() {
    const api = process.env.NEXT_PUBLIC_API_URL
    if (!api) throw new Error("NEXT_PUBLIC_API_URL is required.")
    return [
      {
        // Proxy API calls to the Hono API server in development.
        // This keeps browser calls same-origin while targeting the public API URL.
        source: "/api/v1/:path*",
        destination: `${api}/:path*`,
      },
    ]
  },
}

export default nextConfig

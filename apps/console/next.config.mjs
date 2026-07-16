/* global process */

import { loadWorkspaceEnvForNextConfig } from "../../packages/env/next-config.mjs";

loadWorkspaceEnvForNextConfig();

/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ["console.planisfy.localhost"],
  output: "standalone",
  transpilePackages: ["@planisfy/ui", "@planisfy/auth"],
  async rewrites() {
    const api =
      process.env.CONSOLE_API_INTERNAL_ORIGIN ||
      process.env.NEXT_PUBLIC_API_URL;
    if (!api) throw new Error("NEXT_PUBLIC_API_URL is required.");
    return [
      {
        source: "/api/auth/:path*",
        destination: `${api}/api/auth/:path*`,
      },
      {
        // Proxy API calls to the Hono API server in development.
        // This keeps browser calls same-origin while allowing containers to
        // target the API service over the internal Docker network.
        source: "/api/v1/:path*",
        destination: `${api}/:path*`,
      },
    ];
  },
};

export default nextConfig;

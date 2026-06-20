import { loadWorkspaceEnvForNextConfig } from "../../packages/env/next-config.mjs"

loadWorkspaceEnvForNextConfig()

/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ["planisfy.localhost"],
  output: "standalone",
  transpilePackages: ["@planisfy/ui", "@planisfy/auth"],
}

export default nextConfig

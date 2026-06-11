import { loadWorkspaceEnvForNextConfig } from "../../packages/env/next-config.mjs"

loadWorkspaceEnvForNextConfig()

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  transpilePackages: ["@planisfy/ui", "@planisfy/auth"],
}

export default nextConfig

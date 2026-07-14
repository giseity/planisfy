import { loadWorkspaceEnvForNextConfig } from "../../packages/env/next-config.mjs"
import { createMDX } from "fumadocs-mdx/next"

loadWorkspaceEnvForNextConfig()

const withMDX = createMDX()

/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ["planisfy.localhost"],
  output: "standalone",
  transpilePackages: ["@planisfy/ui", "@planisfy/auth"],
}

export default withMDX(nextConfig)

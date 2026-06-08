/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  transpilePackages: ["@planisfy/ui", "@planisfy/auth"],
}

export default nextConfig

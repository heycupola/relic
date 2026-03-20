/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["convex", "@repo/backend"],
};

export default nextConfig;

import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

initOpenNextCloudflareForDev();

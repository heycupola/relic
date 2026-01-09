import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    // Resolve the symlinked convex directory properly
    config.resolve.alias = {
      ...config.resolve.alias,
      "@/convex": path.resolve(__dirname, "convex"),
    };
    return config;
  },
};

export default nextConfig;

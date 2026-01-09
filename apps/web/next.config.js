import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Transpile the convex package to ensure proper bundling
  transpilePackages: ["convex"],

  // Webpack configuration (for production builds)
  webpack: (config) => {
    // Ensure @/convex resolves to the local convex directory (symlink)
    config.resolve.alias = {
      ...config.resolve.alias,
      "@/convex": path.resolve(__dirname, "convex"),
    };
    return config;
  },

  // Turbopack configuration (for dev with --turbopack flag)
  turbopack: {
    // Explicitly resolve @/convex to handle symlink correctly
    resolveAlias: {
      "@/convex": path.resolve(__dirname, "convex"),
    },
  },
};

export default nextConfig;

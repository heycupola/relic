/** @type {import('next').NextConfig} */
const nextConfig = {
  // Transpile the convex package to ensure proper bundling
  transpilePackages: ["convex"],

  // Turbopack configuration
  // Note: Path aliases from tsconfig.json are automatically read by Turbopack
  // The @/convex alias works via tsconfig.json paths: { "@/*": ["./*"] }
};

export default nextConfig;

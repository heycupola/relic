/** @type {import('next').NextConfig} */
const nextConfig = {
  // Transpile the convex package to ensure proper bundling
  transpilePackages: ["convex", "@repo/backend"],
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // For development, use default .next directory
  // For production build, use 'output: export' to generate static files
  ...(process.env.NODE_ENV === 'production' && {
    output: 'export',
    distDir: 'out',
  }),
  images: {
    unoptimized: true,
  },
  // Use relative paths for Electron file:// protocol
  assetPrefix: process.env.NODE_ENV === 'production' ? './' : undefined,
  trailingSlash: true,
  typescript: {
    ignoreBuildErrors: false,
  },
};

export default nextConfig;

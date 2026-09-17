import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['sharp'],
  experimental: { cpus: 2 },
};

export default nextConfig;

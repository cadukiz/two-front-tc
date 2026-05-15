import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // @twofront/domain is consumed from source (workspace:*); let Next transpile it.
  transpilePackages: ["@twofront/domain"],
};

export default nextConfig;

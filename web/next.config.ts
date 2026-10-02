import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  distDir: process.env.EXPERIMENT_INSTANCE
    ? `.next-${process.env.EXPERIMENT_INSTANCE}`
    : ".next",
};

export default nextConfig;

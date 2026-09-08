import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingRoot: process.cwd(),
  ...(process.env.STATIC_EXPORT === "true"
    ? { output: "export", trailingSlash: true }
    : {}),
};

export default nextConfig;

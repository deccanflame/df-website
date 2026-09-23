import type { NextConfig } from "next";

if (process.env.PRODUCTION_ORDERING_BUILD === "true" && !process.env.NEXT_PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY) {
  throw new Error("Production ordering requires NEXT_PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY. Register App Check before building for launch.");
}

const nextConfig: NextConfig = {
  outputFileTracingRoot: process.cwd(),
  ...(process.env.STATIC_EXPORT === "true"
    ? { output: "export", trailingSlash: true }
    : {}),
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Task log photos come straight from a phone camera and routinely
      // exceed Next's 1MB default, which was erroring on upload.
      bodySizeLimit: "15mb",
    },
  },
};

export default nextConfig;

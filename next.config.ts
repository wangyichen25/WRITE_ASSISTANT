import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "epub2",
    "mammoth",
    "pdf-parse",
  ],
  webpack: (config) => {
    config.resolve = config.resolve || {};
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      zipfile: path.join(process.cwd(), "node_modules/epub2/zipfile.js"),
    };
    return config;
  },
};

export default nextConfig;

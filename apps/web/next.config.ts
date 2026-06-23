import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native Node.js addons must not be bundled by Turbopack
  serverExternalPackages: ["better-sqlite3", "sqlite-vec"],
};

export default nextConfig;

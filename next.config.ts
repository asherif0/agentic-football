import type { NextConfig } from "next";
const config: NextConfig = {
  outputFileTracingRoot: process.cwd(),
  serverExternalPackages: ["better-sqlite3"],
  // Lets a second dev/build run alongside a live server without sharing `.next`.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};
export default config;

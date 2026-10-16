import type { NextConfig } from "next";
const config: NextConfig = {
  outputFileTracingRoot: process.cwd(),
  serverExternalPackages: ["better-sqlite3"],
};
export default config;

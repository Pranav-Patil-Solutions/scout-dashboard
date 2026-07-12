import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @libsql/client (and its native libsql addon) is on Next's default
  // serverExternalPackages list — no override needed since JOBDASH-003
  // dropped better-sqlite3.
};

export default nextConfig;

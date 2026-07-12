import "server-only";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema";
import { seedIfEmpty } from "./seed";

const DB_PATH =
  process.env.SCOUTDASH_DB_PATH || path.join(process.cwd(), "scoutdash.db");

export type ScoutDb = BetterSQLite3Database<typeof schema>;

function createDb(): ScoutDb {
  const sqlite = new Database(DB_PATH);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });

  // Migrate on boot (§11 Phase 1). Idempotent — the migrator tracks applied files.
  migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });

  // Seed the real pipeline on first run only (§10).
  seedIfEmpty(db);

  return db;
}

// Cache across HMR reloads in dev so we don't reopen / re-migrate every request.
const globalForDb = globalThis as unknown as { __scoutDb?: ScoutDb };
export const db: ScoutDb = globalForDb.__scoutDb ?? (globalForDb.__scoutDb = createDb());

export { schema };

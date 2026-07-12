import "server-only";
import path from "node:path";
import { createClient } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "./schema";

// Turso in the cloud (TURSO_* / DATABASE_* envs); the local SQLite file
// otherwise. Migrations and seed are manual scripts now (npm run db:migrate /
// db:seed) — nothing runs at boot (JOBDASH-003 §1).
const url =
  process.env.TURSO_DATABASE_URL ??
  process.env.DATABASE_URL ??
  `file:${path.join(process.cwd(), "scoutdash.db")}`;
const authToken =
  process.env.TURSO_AUTH_TOKEN ?? process.env.DATABASE_AUTH_TOKEN ?? undefined;

export type ScoutDb = LibSQLDatabase<typeof schema>;

function createDb(): ScoutDb {
  return drizzle(createClient({ url, authToken }), { schema });
}

// Cache across HMR reloads in dev so we don't reopen a client every request.
const globalForDb = globalThis as unknown as { __scoutDb?: ScoutDb };
export const db: ScoutDb = globalForDb.__scoutDb ?? (globalForDb.__scoutDb = createDb());

export { schema };

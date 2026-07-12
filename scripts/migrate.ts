/**
 * JOBDASH-003 §1 — apply drizzle migrations to the configured database.
 * Run: npm run db:migrate   (or: npx tsx scripts/migrate.ts)
 *
 * Targets Turso when TURSO_DATABASE_URL is set, else DATABASE_URL, else the
 * local file:scoutdash.db — the same resolution as lib/db/index.ts.
 * Idempotent: the drizzle migrator tracks applied files.
 */
import path from "node:path";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";

const url =
  process.env.TURSO_DATABASE_URL ??
  process.env.DATABASE_URL ??
  `file:${path.join(process.cwd(), "scoutdash.db")}`;
const authToken =
  process.env.TURSO_AUTH_TOKEN ?? process.env.DATABASE_AUTH_TOKEN ?? undefined;

async function main(): Promise<void> {
  const client = createClient({ url, authToken });
  try {
    const db = drizzle(client);
    await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
    console.log(`Migrations up to date on ${url}`);
  } finally {
    client.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

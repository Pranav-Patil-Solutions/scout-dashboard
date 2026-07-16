/**
 * Dump the configured database (Turso when TURSO_DATABASE_URL is set) to a
 * replayable .sql file — schema + data, sqlite3-compatible. Run before every
 * remote migration (delta 18 rule).
 *
 * Run: npx tsx --env-file=.env.local scripts/backup-turso.ts
 * Output: scoutdash.db.turso-dump-<YYYYMMDD-HHmm>.sql (gitignored via scoutdash.db*)
 * Restore: sqlite3 restored.db < <dump>.sql   (or replay to Turso)
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { createClient, type Client } from "@libsql/client";

const url =
  process.env.TURSO_DATABASE_URL ??
  process.env.DATABASE_URL ??
  `file:${path.join(process.cwd(), "scoutdash.db")}`;
const authToken =
  process.env.TURSO_AUTH_TOKEN ?? process.env.DATABASE_AUTH_TOKEN ?? undefined;

function sqlLiteral(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "NULL";
  if (typeof v === "bigint") return v.toString();
  if (v instanceof ArrayBuffer || v instanceof Uint8Array)
    return `X'${Buffer.from(v as Uint8Array).toString("hex")}'`;
  return `'${String(v).replace(/'/g, "''")}'`;
}

async function dump(client: Client): Promise<string> {
  const lines: string[] = ["PRAGMA foreign_keys=OFF;", "BEGIN TRANSACTION;"];
  const master = await client.execute(
    "SELECT name, type, sql FROM sqlite_master WHERE sql IS NOT NULL " +
      "AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'libsql_%' AND name NOT LIKE '_litestream%' " +
      "ORDER BY CASE type WHEN 'table' THEN 0 ELSE 1 END, name",
  );
  const counts: Record<string, number> = {};
  for (const row of master.rows) {
    lines.push(`${row.sql};`);
    if (row.type !== "table") continue;
    const table = String(row.name);
    const data = await client.execute(`SELECT * FROM "${table}"`);
    counts[table] = data.rows.length;
    for (const r of data.rows) {
      const cols = data.columns.map((c) => `"${c}"`).join(", ");
      const vals = data.columns.map((c) => sqlLiteral(r[c])).join(", ");
      lines.push(`INSERT INTO "${table}" (${cols}) VALUES (${vals});`);
    }
  }
  lines.push("COMMIT;");
  console.table(counts);
  return lines.join("\n") + "\n";
}

async function main(): Promise<void> {
  const client = createClient({ url, authToken });
  try {
    const sql = await dump(client);
    const stamp = new Date()
      .toISOString()
      .replace(/[-:]/g, "")
      .replace("T", "-")
      .slice(0, 13);
    const file = path.join(process.cwd(), `scoutdash.db.turso-dump-${stamp}.sql`);
    writeFileSync(file, sql);
    console.log(`Backed up ${url.replace(/\/\/.*@/, "//<redacted>@")} → ${file}`);
  } finally {
    client.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

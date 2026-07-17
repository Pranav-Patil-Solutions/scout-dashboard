"use server";

import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createClient, type Client } from "@libsql/client";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { scoutJobs } from "./db/schema";

export interface ImportResult {
  ok: boolean;
  error?: string;
  imported?: number;
  updated?: number;
  total?: number;
}

/** en → none · de_en/both → de_en · de/german → native · bonus → bonus */
function mapLanguage(raw: unknown): string {
  const v = String(raw ?? "").toLowerCase().trim();
  if (v === "en" || v === "english" || v === "none") return "none";
  if (v === "de_en" || v === "both" || v === "de+en") return "de_en";
  if (v === "de" || v === "german" || v === "native") return "native";
  if (v === "bonus") return "bonus";
  return "unknown";
}

function toDate(raw: unknown): Date | null {
  if (raw == null) return null;
  if (typeof raw === "number") {
    // unix seconds vs milliseconds
    return new Date(raw > 1e12 ? raw : raw * 1000);
  }
  const parsed = Date.parse(String(raw));
  return Number.isNaN(parsed) ? null : new Date(parsed);
}

/**
 * §8 — Import from the Python jobscraper's SQLite DB (read-only usage: SELECTs
 * only — the jobscraper repo must never be written to). Resilient by design:
 * missing file, unknown schema, or odd columns produce a clear error, never a
 * crash. Dedupe on url: new rows insert as status=new; existing rows refresh
 * score/reason/language but KEEP their triage status (a dismissed job stays
 * dismissed). Gracefully disabled when JOBSCRAPER_DB_PATH is unset (JOBDASH-003
 * §5 — the scraper file only exists on the Mac).
 */
export async function importScoutJobs(): Promise<ImportResult> {
  const raw = process.env.JOBSCRAPER_DB_PATH;
  if (!raw) {
    return { ok: false, error: "JOBSCRAPER_DB_PATH is not set in .env." };
  }
  const dbPath = path.isAbsolute(raw) ? raw : path.join(process.cwd(), raw);
  if (!fs.existsSync(dbPath)) {
    return { ok: false, error: `Scraper DB not found at ${dbPath}. Check JOBSCRAPER_DB_PATH in .env.` };
  }

  let scraper: Client | null = null;
  try {
    scraper = createClient({ url: `file:${dbPath}` });

    // Find a usable table: prefer "jobs", else the first table with url + title.
    const tableRes = await scraper.execute(
      "SELECT name FROM sqlite_master WHERE type='table'",
    );
    const tables = tableRes.rows.map((r) => String(r[0]));
    let table: string | null = null;
    for (const name of ["jobs", ...tables]) {
      if (!tables.includes(name)) continue;
      const colRes = await scraper.execute({
        sql: "SELECT name FROM pragma_table_info(?)",
        args: [name],
      });
      const cols = colRes.rows.map((r) => String(r[0]).toLowerCase());
      if (cols.includes("url") && cols.includes("title")) {
        table = name;
        break;
      }
    }
    if (!table) {
      return { ok: false, error: "No table with url + title columns found in the scraper DB." };
    }

    const result = await scraper.execute(`SELECT * FROM "${table}"`);
    // normalize each row to a lowercase-keyed record for flexible column names
    const rows: Record<string, unknown>[] = result.rows.map((r) => {
      const row: Record<string, unknown> = {};
      result.columns.forEach((col, i) => {
        row[col.toLowerCase()] = r[i];
      });
      return row;
    });

    let imported = 0;
    let updated = 0;

    await db.transaction(async (tx) => {
      for (const row of rows) {
        const url = row.url ? String(row.url) : null;
        if (!url) continue;

        const values = {
          source: row.source != null ? String(row.source) : null,
          title: row.title != null ? String(row.title) : null,
          company: row.company != null ? String(row.company) : null,
          score:
            row.score != null
              ? Number(row.score)
              : row.fit_score != null
                ? Number(row.fit_score)
                : null,
          reason: row.reason != null ? String(row.reason) : null,
          languageFlag: mapLanguage(row.language ?? row.language_flag ?? row.german),
          firstSeen: toDate(row.first_seen ?? row.created_at) ?? new Date(),
        };

        const existing = await tx
          .select({ id: scoutJobs.id })
          .from(scoutJobs)
          .where(eq(scoutJobs.url, url))
          .get();

        if (existing) {
          await tx
            .update(scoutJobs)
            .set({
              score: values.score,
              reason: values.reason,
              languageFlag: values.languageFlag,
              title: values.title,
              company: values.company,
              source: values.source,
            })
            .where(eq(scoutJobs.id, existing.id))
            .run();
          updated++;
        } else {
          await tx
            .insert(scoutJobs)
            .values({ id: randomUUID(), url, status: "new", ...values })
            .run();
          imported++;
        }
      }
    });

    revalidatePath("/triage", "page");
    revalidatePath("/", "layout");
    return { ok: true, imported, updated, total: rows.length };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? `Import failed: ${err.message}` : "Import failed.",
    };
  } finally {
    scraper?.close();
  }
}

export async function dismissScoutJob(id: string): Promise<{ ok: true }> {
  await db.update(scoutJobs).set({ status: "dismissed" }).where(eq(scoutJobs.id, id)).run();
  revalidatePath("/triage", "page");
  return { ok: true };
}

export async function restoreScoutJob(id: string): Promise<{ ok: true }> {
  await db.update(scoutJobs).set({ status: "new" }).where(eq(scoutJobs.id, id)).run();
  revalidatePath("/triage", "page");
  return { ok: true };
}

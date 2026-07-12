"use server";

import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
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
 * §8 — Import from the Python jobscraper's SQLite DB (read-only).
 * Resilient by design: missing file, unknown schema, or odd columns produce a
 * clear error, never a crash. Dedupe on url: new rows insert as status=new;
 * existing rows refresh score/reason/language but KEEP their triage status
 * (a dismissed job stays dismissed).
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

  let scraper: InstanceType<typeof Database> | null = null;
  try {
    scraper = new Database(dbPath, { readonly: true, fileMustExist: true });

    // Find a usable table: prefer "jobs", else the first table with url + title.
    const tables = scraper
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all() as { name: string }[];
    let table: string | null = null;
    const candidates = ["jobs", ...tables.map((t) => t.name)];
    for (const name of candidates) {
      if (!tables.some((t) => t.name === name)) continue;
      const cols = (scraper.prepare(`PRAGMA table_info(${JSON.stringify(name).slice(1, -1)})`).all() as { name: string }[])
        .map((c) => c.name.toLowerCase());
      if (cols.includes("url") && cols.includes("title")) {
        table = name;
        break;
      }
    }
    if (!table) {
      return { ok: false, error: "No table with url + title columns found in the scraper DB." };
    }

    const rows = scraper.prepare(`SELECT * FROM "${table}"`).all() as Record<string, unknown>[];

    let imported = 0;
    let updated = 0;

    db.transaction((tx) => {
      for (const r of rows) {
        // normalize keys to lowercase for flexible column names
        const row: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(r)) row[k.toLowerCase()] = v;

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

        const existing = tx
          .select({ id: scoutJobs.id })
          .from(scoutJobs)
          .where(eq(scoutJobs.url, url))
          .get();

        if (existing) {
          tx.update(scoutJobs)
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
          tx.insert(scoutJobs)
            .values({ id: randomUUID(), url, status: "new", ...values })
            .run();
          imported++;
        }
      }
    });

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
  db.update(scoutJobs).set({ status: "dismissed" }).where(eq(scoutJobs.id, id)).run();
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function restoreScoutJob(id: string): Promise<{ ok: true }> {
  db.update(scoutJobs).set({ status: "new" }).where(eq(scoutJobs.id, id)).run();
  revalidatePath("/", "layout");
  return { ok: true };
}

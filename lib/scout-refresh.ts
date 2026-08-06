"use server";

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { importScoutJobs, type ImportResult } from "./import";

export interface ScoutRefreshResult {
  ok: boolean;
  error?: string;
  scraped?: string;
  import?: ImportResult;
}

/** Scrape+LLM-rank measured ~3.3 min live (daily-run.sh); budget generously for
 * a slower day (more listings, LLM retries) without hanging the button forever. */
const SCRAPE_TIMEOUT_MS = 10 * 60_000;

function repoDir(): string | null {
  const dbPath = process.env.JOBSCRAPER_DB_PATH;
  if (!dbPath) return null;
  return path.dirname(path.isAbsolute(dbPath) ? dbPath : path.join(process.cwd(), dbPath));
}

/** main.py has no dotenv of its own — daily-run.sh sources jobscraper/.env into
 * the shell before invoking it, so a spawned child must merge it in the same way. */
function parseEnvFile(file: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

/**
 * JOBDASH-011 — one-click "Update everything": runs the same two steps as
 * jobscraper/daily-run.sh (scrape+rank, then import) without a terminal.
 * Mac-only: self-disables when the scraper repo isn't on this disk, same
 * pattern as importScoutJobs() and JOBSCRAPER_DB_PATH.
 */
export async function runFullScoutUpdate(): Promise<ScoutRefreshResult> {
  const dir = repoDir();
  if (!dir) {
    return { ok: false, error: "Full update runs on the Mac — JOBSCRAPER_DB_PATH isn't set here." };
  }
  const python = path.join(dir, ".venv", "bin", "python3");
  const entry = path.join(dir, "main.py");
  if (!fs.existsSync(python) || !fs.existsSync(entry)) {
    return { ok: false, error: `Scraper not found at ${dir}.` };
  }

  const env = { ...process.env, ...parseEnvFile(path.join(dir, ".env")) };

  let scraped: string;
  try {
    scraped = await new Promise<string>((resolve, reject) => {
      const child = spawn(python, ["main.py"], { cwd: dir, env, stdio: ["ignore", "pipe", "pipe"] });
      let out = "";
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        reject(new Error(`scrape timed out after ${SCRAPE_TIMEOUT_MS / 1000}s`));
      }, SCRAPE_TIMEOUT_MS);
      child.stdout.on("data", (d) => (out += d));
      child.stderr.on("data", (d) => (out += d));
      child.on("error", (e) => {
        clearTimeout(timer);
        reject(e);
      });
      // A non-zero exit still leaves usable rows in jobs.db (daily-run.sh
      // treats a scrape hiccup the same way) — import whatever landed.
      child.on("close", (code) => {
        clearTimeout(timer);
        resolve(out + (code ? `\n(exit ${code})` : ""));
      });
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  const imported = await importScoutJobs();
  return { ok: imported.ok, error: imported.ok ? undefined : imported.error, scraped, import: imported };
}

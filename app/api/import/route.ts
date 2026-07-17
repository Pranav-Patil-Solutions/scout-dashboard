import { NextResponse } from "next/server";
import { importScoutJobs } from "@/lib/import";

/**
 * POST /api/import — same importScoutJobs() the "Import from scout" button
 * calls, curlable for a manual/scripted trigger. Mac-only in practice: it
 * self-disables (ok:false) when JOBSCRAPER_DB_PATH is unset or unreadable.
 */
export async function POST() {
  const result = await importScoutJobs();
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}

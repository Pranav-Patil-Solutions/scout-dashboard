import { NextResponse } from "next/server";
import { runFullScoutUpdate } from "@/lib/scout-refresh";

/**
 * POST /api/scout-refresh — same runFullScoutUpdate() the "Update everything"
 * button calls, curlable for a manual/scripted trigger. Mac-only in practice:
 * it self-disables (ok:false) when JOBSCRAPER_DB_PATH is unset or the scraper
 * repo isn't found on disk.
 */
export async function POST() {
  const result = await runFullScoutUpdate();
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}

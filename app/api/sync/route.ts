import { NextResponse } from "next/server";
import { runSync } from "@/lib/email/sync";
import { checkAllPostings, type PostingCheckStats } from "@/lib/posting-check";

/** POST /api/sync — run the Gmail sync pipeline. Used by the Sync button (P4) and CLI/tests. */
export async function POST() {
  // JOBDASH-003 §5 — serverless guard: the pipeline shells out to the Claude
  // CLI, which only exists on the Mac. Set SYNC_DISABLED=1 on Vercel.
  if (process.env.SYNC_DISABLED === "1") {
    return NextResponse.json(
      { ok: false, error: "Sync runs on the Mac — this deployment can't reach the Claude CLI." },
      { status: 501 },
    );
  }
  try {
    const stats = await runSync();
    // Piggyback the posting-expiry watchdog on the daily sync ritual;
    // a probe failure must never fail the email sync itself.
    let postings: PostingCheckStats | null = null;
    try {
      postings = await checkAllPostings();
    } catch {
      postings = null;
    }
    return NextResponse.json({ ok: true, ...stats, postings });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "sync failed" },
      { status: 500 },
    );
  }
}

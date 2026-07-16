import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { scoutJobs } from "@/lib/db/schema";
import { fetchJobDescription } from "@/lib/kit/jd";

/**
 * POST /api/scout-jd/[id] — fetch the scout job's posting, reduce it to plain
 * text (lib/kit/jd), and cache it on the row (jd_text / jd_fetched_at).
 * Pure fetch + regex — runs everywhere, including Vercel (NOT behind
 * SYNC_DISABLED). Returns the cached text without refetching when present.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const job = await db.select().from(scoutJobs).where(eq(scoutJobs.id, id)).get();
  if (!job) {
    return NextResponse.json(
      { ok: false, error: "That role is no longer in your scout list." },
      { status: 404 },
    );
  }
  if (job.jdText) {
    return NextResponse.json({ ok: true, text: job.jdText, cached: true });
  }
  if (!job.url) {
    return NextResponse.json(
      { ok: false, error: "This role has no posting URL to read from." },
      { status: 422 },
    );
  }
  try {
    const text = await fetchJobDescription(job.url);
    await db
      .update(scoutJobs)
      .set({ jdText: text, jdFetchedAt: new Date() })
      .where(eq(scoutJobs.id, id))
      .run();
    return NextResponse.json({ ok: true, text, cached: false });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Couldn't read the posting — it may be behind a login, expired, or blocking robots. Open the posting directly instead.",
      },
      { status: 502 },
    );
  }
}

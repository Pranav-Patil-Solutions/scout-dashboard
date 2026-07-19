import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { purgeExpiredScoutJobs, sweepScoutJobs } from "@/lib/scout-sweep";

/**
 * Discover expiry sweep (JOBDASH-007). Plain outbound HTTP + DB — works on
 * Vercel too (no Claude CLI, so no SYNC_DISABLED guard).
 *   POST   — probe every Open role's posting; dead ones flip to `expired`.
 *   DELETE — purge every `expired` row for good.
 */

// Probing a ~200-row queue at concurrency 6 outlives the default function
// window; flips persist per batch so even a hard cut keeps progress.
export const maxDuration = 300;

export async function POST() {
  try {
    const stats = await sweepScoutJobs();
    revalidatePath("/triage", "page");
    revalidatePath("/", "layout");
    return NextResponse.json({ ok: true, ...stats });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "scout sweep failed" },
      { status: 500 },
    );
  }
}

export async function DELETE() {
  try {
    const { deleted } = await purgeExpiredScoutJobs();
    revalidatePath("/triage", "page");
    return NextResponse.json({ ok: true, deleted });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "purge failed" },
      { status: 500 },
    );
  }
}

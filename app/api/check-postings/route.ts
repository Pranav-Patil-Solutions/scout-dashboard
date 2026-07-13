import { NextResponse } from "next/server";
import { checkAllPostings } from "@/lib/posting-check";

/**
 * POST /api/check-postings — probe open cards' apply URLs and auto-move
 * verifiably dead postings to Missed. Works everywhere (plain outbound HTTP —
 * no Claude CLI dependency, so no SYNC_DISABLED guard).
 */
export async function POST() {
  try {
    const stats = await checkAllPostings();
    return NextResponse.json({ ok: true, ...stats });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "posting check failed" },
      { status: 500 },
    );
  }
}

import { NextResponse } from "next/server";
import { runSync } from "@/lib/email/sync";

/** POST /api/sync — run the Gmail sync pipeline. Used by the Sync button (P4) and CLI/tests. */
export async function POST() {
  try {
    const stats = await runSync();
    return NextResponse.json({ ok: true, ...stats });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "sync failed" },
      { status: 500 },
    );
  }
}

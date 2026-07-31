import { NextResponse } from "next/server";
import { gradeScoutJob, gradeStaleScoutJobs } from "@/lib/reco/grade-job";

/**
 * JOBDASH-010 — fit grading over HTTP.
 *
 * POST /api/fit-grade                      → sweep stale/ungraded rows (backfill)
 * POST /api/fit-grade  {"id": "..."}       → re-grade one row
 * POST /api/fit-grade  {"id": "...", "force": true} → re-grade even if current
 *
 * A route rather than a script because the grader is `server-only` (it reaches
 * the DB and spawns `claude -p`); running it through the app keeps one code
 * path instead of a script that drifts from what the dashboard actually does.
 * Mac-only in practice — the Claude CLI is the transport.
 */
export async function POST(request: Request) {
  let body: { id?: string; force?: boolean; limit?: number } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    // no body = sweep with defaults
  }

  try {
    if (body.id) {
      const assessment = await gradeScoutJob(body.id, { force: body.force });
      if (!assessment) {
        return NextResponse.json(
          { ok: false, error: "No job description available to grade — the posting may be dead." },
          { status: 422 },
        );
      }
      return NextResponse.json({ ok: true, assessment });
    }
    const stats = await gradeStaleScoutJobs({ limit: body.limit });
    return NextResponse.json({ ok: true, ...stats });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "fit grading failed" },
      { status: 500 },
    );
  }
}

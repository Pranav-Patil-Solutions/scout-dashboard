import { NextResponse } from "next/server";
import { and, eq, notInArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { applications, scoutJobs } from "@/lib/db/schema";
import { createApplication } from "@/lib/actions";
import { resolveJd } from "@/lib/kit/generate";
import { generateKitToTarget } from "@/lib/kit/refine";

/**
 * POST /api/studio — Kit Studio (JOBDASH-005 v1.2).
 * Input: a Scout Inbox job OR a pasted JD. Creates (or reuses) the
 * application card, then runs the generate→grade→refine loop to the target
 * relatability score. Mac-only (Claude CLI + local files).
 */

interface StudioBody {
  scoutJobId?: string;
  manual?: {
    company?: string;
    roleTitle?: string;
    jd?: string;
    applyUrl?: string;
  };
  target?: number;
  maxRounds?: number;
}

export async function POST(req: Request) {
  if (process.env.SYNC_DISABLED === "1") {
    return NextResponse.json(
      { ok: false, error: "Kit Studio runs on the Mac — this deployment has no Claude CLI." },
      { status: 501 },
    );
  }

  let body: StudioBody;
  try {
    body = (await req.json()) as StudioBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  try {
    let applicationId: string;

    if (body.scoutJobId) {
      const job = await db
        .select()
        .from(scoutJobs)
        .where(eq(scoutJobs.id, body.scoutJobId))
        .get();
      if (!job) return NextResponse.json({ ok: false, error: "Scout job not found." }, { status: 404 });
      if (job.status === "promoted" && job.promotedApplicationId) {
        applicationId = job.promotedApplicationId; // already on the board — reuse the card
      } else {
        // fail BEFORE creating a card if the posting URL yields no JD text
        await resolveJd({ jdUrl: null, applyUrl: job.url, notes: null });
        const created = await createApplication({
          company: job.company ?? "Unknown",
          roleTitle: job.title ?? "Unknown role",
          source: "scraper",
          fitScore: job.score ?? null,
          germanReq: "unknown",
          isKitReady: false,
          applyUrl: job.url ?? "",
          status: "to_apply",
          scoutJobId: job.id,
        });
        applicationId = created.id;
      }
    } else if (body.manual) {
      const { company, roleTitle, jd, applyUrl } = body.manual;
      if (!company?.trim() || !roleTitle?.trim() || !jd?.trim()) {
        return NextResponse.json(
          { ok: false, error: "Company, role, and JD text are required for a pasted job." },
          { status: 422 },
        );
      }
      // Idempotent re-runs: reuse an existing open card for the same company+role
      // (e.g. after a timed-out attempt) instead of duplicating it.
      const existing = await db
        .select({ id: applications.id })
        .from(applications)
        .where(
          and(
            sql`lower(${applications.company}) = lower(${company.trim()})`,
            sql`lower(${applications.roleTitle}) = lower(${roleTitle.trim()})`,
            notInArray(applications.status, ["rejected", "withdrawn", "expired_missed"]),
          ),
        )
        .get();
      if (existing) {
        applicationId = existing.id;
      } else {
        // Pasted JD goes into notes — resolveJd() falls back to notes when no URL resolves.
        const created = await createApplication({
          company,
          roleTitle,
          source: "cold-email",
          fitScore: null,
          germanReq: "unknown",
          isKitReady: false,
          applyUrl: applyUrl || "",
          status: "to_apply",
          notes: jd,
        });
        applicationId = created.id;
      }
    } else {
      return NextResponse.json(
        { ok: false, error: "Pick a scout job or paste a JD." },
        { status: 422 },
      );
    }

    const result = await generateKitToTarget(applicationId, {
      target: body.target,
      maxRounds: body.maxRounds,
    });

    return NextResponse.json({
      ok: true,
      applicationId,
      rounds: result.rounds,
      reachedTarget: result.reachedTarget,
      grade: result.final.grade,
      resumeVariant: result.final.resumeVariant,
      files: result.final.files,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "studio run failed";
    const status = message.startsWith("No job description") ? 422 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}

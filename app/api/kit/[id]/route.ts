import { NextResponse } from "next/server";
import { generateKitToTarget } from "@/lib/kit/refine";

/**
 * POST /api/kit/[id] — generate a tailored CV + cover letter (JOBDASH-005),
 * running the generate→grade→refine loop to the target relatability score
 * (default 80) and keeping the best round. Below-target kits are graded but
 * NOT marked ready (THE BAR, v1.2.1). Mac-only: needs the Claude CLI, the base
 * resume file, and local kits/ storage — same condition SYNC_DISABLED encodes.
 */
interface KitBody {
  target?: number;
  maxRounds?: number;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (process.env.SYNC_DISABLED === "1") {
    return NextResponse.json(
      { ok: false, error: "Generate kits from the Mac — this deployment has no Claude CLI or local files." },
      { status: 501 },
    );
  }
  const { id } = await params;
  // Tolerant body parse — the detail-card Regenerate button POSTs no body.
  let body: KitBody = {};
  try {
    body = ((await req.json()) as KitBody | null) ?? {};
  } catch {
    body = {};
  }
  const target = body.target ?? 80;
  const maxRounds = body.maxRounds ?? 2;
  try {
    const result = await generateKitToTarget(id, { target, maxRounds });
    return NextResponse.json({
      ok: true,
      target,
      rounds: result.rounds,
      keptRound: result.keptRound,
      reachedTarget: result.reachedTarget,
      grade: result.final.grade,
      resumeVariant: result.final.resumeVariant,
      resumePages: result.final.resumePages,
      warnings: result.final.warnings,
      files: result.final.files,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "kit generation failed";
    const status = message.includes("not found")
      ? 404
      : message.startsWith("No job description")
        ? 422
        : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}

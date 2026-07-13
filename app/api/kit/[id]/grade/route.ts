import { NextResponse } from "next/server";
import { gradeKit } from "@/lib/kit/grade";

/** POST /api/kit/[id]/grade — (re)grade an existing kit vs the live posting. Mac-only. */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (process.env.SYNC_DISABLED === "1") {
    return NextResponse.json(
      { ok: false, error: "Grade kits from the Mac — this deployment has no Claude CLI." },
      { status: 501 },
    );
  }
  const { id } = await params;
  try {
    const grade = await gradeKit(id);
    return NextResponse.json({ ok: true, grade });
  } catch (err) {
    const message = err instanceof Error ? err.message : "grading failed";
    const status = message.includes("not found")
      ? 404
      : message.startsWith("No generated kit")
        ? 422
        : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}

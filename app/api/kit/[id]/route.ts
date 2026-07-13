import { NextResponse } from "next/server";
import { generateKit } from "@/lib/kit/generate";

/**
 * POST /api/kit/[id] — generate a tailored CV + cover letter (JOBDASH-005).
 * Mac-only: needs the Claude CLI, the base resume file, and local kits/
 * storage — same condition SYNC_DISABLED encodes on Vercel.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (process.env.SYNC_DISABLED === "1") {
    return NextResponse.json(
      { ok: false, error: "Generate kits from the Mac — this deployment has no Claude CLI or local files." },
      { status: 501 },
    );
  }
  const { id } = await params;
  try {
    const result = await generateKit(id);
    return NextResponse.json({ ok: true, ...result });
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

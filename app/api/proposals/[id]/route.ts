import { type NextRequest, NextResponse } from "next/server";
import { acceptProposal, dismissProposal } from "@/lib/email/apply";

/** PATCH /api/proposals/:id — body { action: "accept" | "dismiss" }. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { action?: string } | null;
  const action = body?.action;
  if (action !== "accept" && action !== "dismiss") {
    return NextResponse.json(
      { ok: false, error: 'action must be "accept" or "dismiss"' },
      { status: 400 },
    );
  }
  const result = action === "accept" ? acceptProposal(id) : dismissProposal(id);
  if (!result.ok) {
    const status = result.error.includes("not found") ? 404 : 409;
    return NextResponse.json(result, { status });
  }
  return NextResponse.json(result);
}

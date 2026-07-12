import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { emailEvents, proposals } from "@/lib/db/schema";

/** GET /api/proposals — pending proposals with their source email, newest first (P4 review UI). */
export async function GET() {
  const rows = await db
    .select({
      proposal: proposals,
      email: {
        sender: emailEvents.sender,
        subject: emailEvents.subject,
        snippet: emailEvents.snippet,
        receivedAt: emailEvents.receivedAt,
      },
    })
    .from(proposals)
    .innerJoin(emailEvents, eq(proposals.sourceEmailEventId, emailEvents.id))
    .where(eq(proposals.status, "pending"))
    .orderBy(desc(proposals.createdAt))
    .all();
  return NextResponse.json({ ok: true, proposals: rows });
}

import { NextResponse } from "next/server";
import { analyzeRejections, pct, verifyNarration } from "@/lib/analysis/rejections";
import { getAllApplications } from "@/lib/queries";
import { claudePrompt } from "@/lib/llm-cli";

/**
 * POST /api/rejection-narrative — JOBDASH-006 §4. The deterministic table from
 * lib/analysis/rejections is the source of truth; the LLM only puts words
 * around numbers it is handed, and verifyNarration rejects any reply that
 * contains a numeral not present in that table (fabrications cannot render).
 * Mac-only (claude CLI) — SYNC_DISABLED → 501.
 */

const SYSTEM = `You narrate a job-search rejection breakdown for the applicant (second person).
HARD RULES:
- Use ONLY numbers that appear verbatim in the provided data — counts and the pre-computed percent strings. Never compute, extrapolate, estimate, or invent a figure, and never write a numeral that is not in the data.
- If a segment's sample is small (population under 5), say the signal is early rather than drawing firm conclusions.
- 3 to 5 plain sentences, no headings, no bullet points, no praise. End with the single most actionable observation.`;

export async function POST() {
  if (process.env.SYNC_DISABLED === "1") {
    return NextResponse.json(
      { ok: false, error: "Narration runs on the Mac dashboard — this deployment has no Claude CLI." },
      { status: 501 },
    );
  }
  try {
    const apps = await getAllApplications();
    const analysis = analyzeRejections(apps);
    if (analysis.rejected === 0) {
      return NextResponse.json(
        { ok: false, error: "No rejections tracked yet — nothing to narrate." },
        { status: 422 },
      );
    }
    // Rows carry pre-formatted percents so the model never has to do arithmetic.
    const payload = {
      population: analysis.population,
      rejected: analysis.rejected,
      overallRate: pct(analysis.population ? analysis.rejected / analysis.population : 0),
      dimensions: analysis.dimensions.map((d) => ({
        dimension: d.label,
        segments: d.rows.map((r) => ({
          segment: r.label,
          population: r.population,
          rejected: r.rejected,
          rate: pct(r.rate),
        })),
      })),
    };
    const text = (
      await claudePrompt({
        model: "claude-haiku-4-5",
        system: SYSTEM,
        prompt: `Rejection data (deterministic, from the tracker database):\n${JSON.stringify(payload, null, 2)}`,
        timeoutMs: 120_000,
      })
    ).trim();
    const check = verifyNarration(text, analysis);
    if (!check.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: `Narration rejected — it contained ${check.offending.join(", ")}, which is not in the data. The table above is the source of truth.`,
        },
        { status: 502 },
      );
    }
    return NextResponse.json({ ok: true, text });
  } catch (err) {
    const message = err instanceof Error ? err.message : "narration failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

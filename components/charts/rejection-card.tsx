"use client";

import { useState, useTransition } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { fetchJson } from "@/lib/fetch-json";
import { pct, type RejectionAnalysis } from "@/lib/analysis/rejections";

/**
 * "Why roles close" — JOBDASH-006 §4. The table is deterministic (every number
 * is a DB count); the Narrate button is the only LLM touchpoint (Mac-only).
 * Bars are plain HTML per the repo rule (Recharts drops zero-value labels).
 */
export function RejectionCard({ analysis }: { analysis: RejectionAnalysis }) {
  const [narrative, setNarrative] = useState<string | null>(null);
  const [loading, startLoad] = useTransition();

  function narrate() {
    startLoad(async () => {
      try {
        const res = await fetchJson<{ ok: boolean; text?: string; error?: string }>(
          "/api/rejection-narrative",
          { method: "POST" },
        );
        if (!res.ok || !res.text) throw new Error(res.error || "Couldn't narrate.");
        setNarrative(res.text);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't narrate.");
      }
    });
  }

  return (
    <div className="rounded-2xl border border-hairline bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline px-4 py-3">
        <div>
          <h2 className="text-[13px] font-semibold text-foreground">Why roles close</h2>
          <p className="text-[11.5px] text-ink-3">
            Rejection rate by segment — every number is a live count, nothing estimated.
          </p>
        </div>
        <button
          type="button"
          onClick={narrate}
          disabled={loading || analysis.rejected === 0}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-hairline px-2.5 text-[12px] font-medium text-ink-2 transition-colors hover:border-white/15 hover:text-foreground disabled:opacity-50"
          title="Runs on the Mac via the Claude CLI"
        >
          {loading ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
          Narrate
        </button>
      </div>

      {analysis.rejected === 0 ? (
        <p className="px-4 py-6 text-[12.5px] text-ink-3">
          No rejections tracked yet — when Gmail sync closes applications, the pattern shows up here.
        </p>
      ) : (
        <>
          <ul className="border-b border-hairline px-4 py-3 text-[12.5px] leading-relaxed text-ink-2">
            {analysis.summary.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>

          <div className="grid gap-x-6 gap-y-4 px-4 py-4 sm:grid-cols-2">
            {analysis.dimensions.map((dim) => (
              <div key={dim.key}>
                <h3 className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-ink-3">
                  {dim.label}
                </h3>
                <ul className="space-y-1.5">
                  {dim.rows.map((row) => (
                    <li key={row.key} className="flex items-center gap-2 text-[12px]">
                      <span className="w-28 shrink-0 truncate text-ink-2" title={row.label}>
                        {row.label}
                      </span>
                      <span className="relative h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-white/[0.05]">
                        <span
                          className="absolute inset-y-0 left-0 rounded-full"
                          style={{
                            width: `${Math.round(row.rate * 100)}%`,
                            background: "var(--status-rejected, #fb5473)",
                          }}
                        />
                      </span>
                      <span className="tnum w-20 shrink-0 text-right text-ink-3">
                        {row.rejected}/{row.population} · {pct(row.rate)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </>
      )}

      {narrative && (
        <p className="border-t border-hairline px-4 py-3 text-[12.5px] leading-relaxed text-ink-2">
          <Sparkles className="mr-1.5 inline size-3.5 text-accent-hi" />
          {narrative}
        </p>
      )}
    </div>
  );
}

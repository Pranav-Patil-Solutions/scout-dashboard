"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CircleGauge, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { gradeTone, type KitGrade } from "@/lib/kit/grade-schema";
import { fmtRelative } from "@/lib/format";

/**
 * CV Grade card (JOBDASH-005 v1.1) — relatability score vs the live posting,
 * subscore bars, keyword coverage, and the improvements that will steer the
 * next generation.
 */

const SUBSCORE_LABELS: Array<{ key: keyof KitGrade["subscores"]; label: string }> = [
  { key: "keywords", label: "Keyword coverage" },
  { key: "experience", label: "Experience match" },
  { key: "seniority", label: "Seniority fit" },
  { key: "evidence", label: "Quantified evidence" },
];

export function KitGradeCard({
  appId,
  grade,
  hasKit,
}: {
  appId: string;
  grade: KitGrade | null;
  hasKit: boolean;
}) {
  const router = useRouter();
  const [running, setRunning] = useState(false);

  async function regrade() {
    setRunning(true);
    try {
      const res = await fetch(`/api/kit/${appId}/grade`, { method: "POST" });
      const body = (await res.json()) as { ok: boolean; error?: string; grade?: KitGrade };
      if (!body.ok) throw new Error(body.error ?? "grading failed");
      toast.success(`CV graded ${body.grade?.overall}/100`, {
        description: body.grade?.verdict,
      });
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Grading failed.");
    } finally {
      setRunning(false);
    }
  }

  if (!hasKit && !grade) return null;

  return (
    <section className="rounded-2xl border border-hairline bg-card px-4 py-3">
      <div className="flex items-center justify-between pb-1 pt-1">
        <h2 className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
          <CircleGauge className="size-4 text-accent-hi" /> CV Grade
          {grade && (
            <span className="text-[11px] font-medium text-ink-3">
              vs live posting · {fmtRelative(new Date(grade.graded_at))}
            </span>
          )}
        </h2>
        <button
          type="button"
          disabled={running}
          onClick={regrade}
          className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-hairline bg-white/[0.02] px-2.5 text-[11px] font-medium text-ink-2 transition-colors hover:border-white/15 hover:text-foreground disabled:opacity-60"
        >
          {running ? (
            <>
              <Loader2 className="size-3 animate-spin" /> Grading…
            </>
          ) : grade ? (
            "Re-grade"
          ) : (
            "Grade CV"
          )}
        </button>
      </div>

      {!grade ? (
        <p className="pb-1 text-[12px] text-ink-3">
          Kit generated but not graded yet — press Grade CV to score it against the posting.
        </p>
      ) : (
        <div className="flex flex-col gap-3 pb-1 sm:flex-row sm:gap-5">
          {/* Score */}
          <div className="flex shrink-0 items-center gap-3 sm:flex-col sm:items-start">
            <span
              className="tnum text-4xl font-semibold leading-none tracking-tight"
              style={{ color: gradeTone(grade.overall) }}
            >
              {grade.overall}
            </span>
            <p className="max-w-[180px] text-[12px] leading-snug text-ink-2">{grade.verdict}</p>
          </div>

          {/* Detail */}
          <div className="min-w-0 flex-1 space-y-3">
            <div className="space-y-1.5">
              {SUBSCORE_LABELS.map(({ key, label }) => {
                const v = grade.subscores[key];
                return (
                  <div key={key} className="flex items-center gap-2.5">
                    <span className="w-36 shrink-0 text-[11px] text-ink-3">{label}</span>
                    <span
                      className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.05]"
                      role="img"
                      aria-label={`${label}: ${v} of 100`}
                    >
                      <span
                        className="block h-full rounded-full"
                        style={{ width: `${v}%`, background: gradeTone(v) }}
                      />
                    </span>
                    <span className="tnum w-7 shrink-0 text-right text-[11px] font-semibold text-ink-2">
                      {v}
                    </span>
                  </div>
                );
              })}
            </div>

            {grade.missing_keywords.length > 0 && (
              <ChipRow label="Missing from CV" items={grade.missing_keywords} tone="warn" />
            )}
            {grade.matched_keywords.length > 0 && (
              <ChipRow label="Matched" items={grade.matched_keywords} tone="ok" />
            )}

            {grade.improvements.length > 0 && (
              <div>
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-3">
                  For next time <span className="normal-case">(auto-applied on Regenerate)</span>
                </p>
                <ol className="list-decimal space-y-0.5 pl-4 text-[12px] leading-snug text-ink-2 marker:text-ink-3">
                  {grade.improvements.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ol>
              </div>
            )}

            {grade.red_flags.length > 0 && (
              <p className="text-[12px] leading-snug text-[#fb5473]">
                ⚑ {grade.red_flags.join(" · ")}
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function ChipRow({
  label,
  items,
  tone,
}: {
  label: string;
  items: string[];
  tone: "ok" | "warn";
}) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className="mr-1 text-[11px] font-semibold uppercase tracking-wide text-ink-3">
        {label}
      </span>
      {items.slice(0, 10).map((k) => (
        <span
          key={k}
          className={cn(
            "rounded-full px-2 py-0.5 text-[10.5px] font-medium",
            tone === "warn" ? "bg-[#fbb03b1f] text-[#fbb03b]" : "bg-white/[0.05] text-ink-2",
          )}
        >
          {k}
        </span>
      ))}
      {items.length > 10 && (
        <span className="text-[10.5px] text-ink-3">+{items.length - 10}</span>
      )}
    </div>
  );
}

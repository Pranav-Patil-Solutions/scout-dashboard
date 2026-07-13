"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, ClipboardPaste, FileText, Inbox, Loader2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { gradeTone, type KitGrade } from "@/lib/kit/grade-schema";
import { FitChip } from "@/components/chips";
import type { ScoutJob } from "@/lib/db/schema";

/** Kit Studio form + run state (JOBDASH-005 v1.2). One long request; the
 * server loops generate→grade→refine, ~4–9 min depending on rounds. */

interface StudioResponse {
  ok: boolean;
  error?: string;
  applicationId?: string;
  rounds?: Array<{ overall: number | null; verdict: string | null }>;
  reachedTarget?: boolean;
  grade?: KitGrade | null;
}

const TARGETS = [75, 80, 85];

export function StudioForm({ jobs }: { jobs: ScoutJob[] }) {
  const router = useRouter();
  const [mode, setMode] = useState<"scout" | "paste">(jobs.length > 0 ? "scout" : "paste");
  const [scoutJobId, setScoutJobId] = useState<string | null>(jobs[0]?.id ?? null);
  const [company, setCompany] = useState("");
  const [roleTitle, setRoleTitle] = useState("");
  const [jd, setJd] = useState("");
  const [applyUrl, setApplyUrl] = useState("");
  const [target, setTarget] = useState(80);
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<StudioResponse | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (running) {
      timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [running]);

  async function run() {
    setRunning(true);
    setElapsed(0);
    setResult(null);
    try {
      const payload =
        mode === "scout"
          ? { scoutJobId, target }
          : { manual: { company, roleTitle, jd, applyUrl }, target };
      const res = await fetch("/api/studio", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await res.json()) as StudioResponse;
      if (!body.ok) throw new Error(body.error ?? "studio run failed");
      setResult(body);
      toast.success(
        body.reachedTarget
          ? `Target hit — CV graded ${body.grade?.overall}/100`
          : `Best effort — CV graded ${body.grade?.overall}/100`,
        { description: body.grade?.verdict },
      );
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Studio run failed.");
    } finally {
      setRunning(false);
    }
  }

  const canRun =
    mode === "scout"
      ? !!scoutJobId
      : company.trim().length > 0 && roleTitle.trim().length > 0 && jd.trim().length > 50;

  return (
    <div className="space-y-4">
      {/* Source */}
      <section className="rounded-2xl border border-hairline bg-card p-4">
        <div className="mb-3 flex gap-1.5">
          <ModeTab
            active={mode === "scout"}
            onClick={() => setMode("scout")}
            icon={<Inbox className="size-3.5" />}
            label={`Scout Inbox (${jobs.length})`}
          />
          <ModeTab
            active={mode === "paste"}
            onClick={() => setMode("paste")}
            icon={<ClipboardPaste className="size-3.5" />}
            label="Paste a JD"
          />
        </div>

        {mode === "scout" ? (
          jobs.length === 0 ? (
            <p className="text-[12px] text-ink-3">
              No new scouted jobs — switch to “Paste a JD” or check the Scout Inbox later.
            </p>
          ) : (
            <div className="space-y-1.5" role="radiogroup" aria-label="Scouted job">
              {jobs.map((job) => (
                <label
                  key={job.id}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-2.5 transition-colors",
                    scoutJobId === job.id
                      ? "border-[rgba(155,140,255,0.45)] bg-primary/[0.07]"
                      : "border-hairline hover:border-white/15",
                  )}
                >
                  <input
                    type="radio"
                    name="scout-job"
                    className="sr-only"
                    checked={scoutJobId === job.id}
                    onChange={() => setScoutJobId(job.id)}
                  />
                  <span
                    className={cn(
                      "grid size-4 shrink-0 place-items-center rounded-full border",
                      scoutJobId === job.id ? "border-accent-hi" : "border-white/20",
                    )}
                  >
                    {scoutJobId === job.id && (
                      <span className="size-2 rounded-full bg-[linear-gradient(135deg,#7c6bf5,#4e7df0)]" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-semibold text-foreground">
                      {job.company} <span className="font-normal text-ink-2">— {job.title}</span>
                    </span>
                    <span className="block truncate text-[11.5px] text-ink-3">
                      {job.reason ?? job.url ?? ""}
                    </span>
                  </span>
                  <FitChip score={job.score} band={null} />
                </label>
              ))}
            </div>
          )
        ) : (
          <div className="grid gap-2.5 sm:grid-cols-2">
            <StudioInput label="Company" value={company} onChange={setCompany} placeholder="e.g. Tacto" />
            <StudioInput label="Role title" value={roleTitle} onChange={setRoleTitle} placeholder="e.g. Chief of Staff" />
            <StudioInput
              label="Posting URL (optional)"
              value={applyUrl}
              onChange={setApplyUrl}
              placeholder="https://…"
              className="sm:col-span-2"
            />
            <label className="sm:col-span-2">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-3">
                Job description (paste the full text)
              </span>
              <textarea
                value={jd}
                onChange={(e) => setJd(e.target.value)}
                rows={7}
                placeholder="Paste the JD here — responsibilities, requirements, stack…"
                className="w-full rounded-xl border border-hairline bg-white/[0.02] px-3 py-2.5 text-[13px] leading-relaxed text-foreground placeholder:text-ink-3 focus:border-white/20 focus:outline-none"
              />
            </label>
          </div>
        )}
      </section>

      {/* Target + run */}
      <section className="flex flex-wrap items-center gap-3 rounded-2xl border border-hairline bg-card p-4">
        <div className="flex items-center gap-1.5">
          <span className="mr-1 text-[11px] font-semibold uppercase tracking-wide text-ink-3">
            Target score
          </span>
          {TARGETS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTarget(t)}
              className={cn(
                "tnum h-8 rounded-lg border px-3 text-[12px] font-semibold transition-colors",
                target === t
                  ? "border-[rgba(155,140,255,0.45)] bg-primary/[0.12] text-accent-hi"
                  : "border-hairline text-ink-2 hover:border-white/15",
              )}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-3">
          {running && (
            <span className="tnum text-[12px] text-ink-3">
              {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")} · generating →
              grading{elapsed > 240 ? " → refining" : ""}…
            </span>
          )}
          <button
            type="button"
            disabled={!canRun || running}
            onClick={run}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border-0 bg-[linear-gradient(135deg,#7c6bf5,#4e7df0)] px-4 text-[13px] font-semibold text-white shadow-[0_0_0_1px_rgba(155,140,255,0.35),0_8px_24px_-10px_rgba(124,107,245,0.7)] transition-[filter] hover:brightness-110 disabled:opacity-50"
          >
            {running ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Building kit…
              </>
            ) : (
              <>
                <Wand2 className="size-4" /> Build kit
              </>
            )}
          </button>
        </div>
        <p className="w-full text-[11px] leading-snug text-ink-3">
          Runs on the Mac (~4–9 min): humanized CV + cover letter from your real experience only →
          graded vs the JD → auto-refined once if below target. Never invents facts.
        </p>
      </section>

      {/* Result */}
      {result?.ok && result.grade && (
        <section className="rounded-2xl border border-hairline bg-card p-4">
          <div className="flex flex-wrap items-center gap-4">
            <span
              className="tnum text-4xl font-semibold leading-none tracking-tight"
              style={{ color: gradeTone(result.grade.overall) }}
            >
              {result.grade.overall}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-foreground">
                {result.reachedTarget ? "Target reached" : "Best effort (target missed)"}
                {result.rounds && result.rounds.length > 1 && (
                  <span className="tnum ml-2 font-normal text-ink-3">
                    {result.rounds.map((r) => r.overall ?? "—").join(" → ")}
                  </span>
                )}
              </p>
              <p className="mt-0.5 text-[12.5px] leading-snug text-ink-2">{result.grade.verdict}</p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <ResultLink href={`/api/kit/${result.applicationId}/resume.pdf`}>CV (PDF)</ResultLink>
            <ResultLink href={`/api/kit/${result.applicationId}/cover-letter.pdf`}>
              Cover letter (PDF)
            </ResultLink>
            <Link
              href={`/a/${result.applicationId}`}
              className="inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-[12px] font-semibold text-accent-hi hover:underline"
            >
              Open application card <ArrowUpRight className="size-3.5" />
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}

function ModeTab({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-[12px] font-semibold transition-colors",
        active
          ? "border-[rgba(155,140,255,0.45)] bg-primary/[0.12] text-accent-hi"
          : "border-hairline text-ink-2 hover:border-white/15 hover:text-foreground",
      )}
    >
      {icon} {label}
    </button>
  );
}

function StudioInput({
  label,
  value,
  onChange,
  placeholder,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <label className={className}>
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-3">
        {label}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-9 w-full rounded-xl border border-hairline bg-white/[0.02] px-3 text-[13px] text-foreground placeholder:text-ink-3 focus:border-white/20 focus:outline-none"
      />
    </label>
  );
}

function ResultLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-hairline px-2.5 text-[12px] font-semibold text-ink-2 transition-colors hover:border-white/15 hover:text-foreground"
    >
      <FileText className="size-3.5" /> {children}
    </a>
  );
}

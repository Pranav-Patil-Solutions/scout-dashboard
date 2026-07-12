"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import {
  ArrowUpRight,
  DownloadCloud,
  ExternalLink,
  Inbox,
  Loader2,
  Undo2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { FitChip, GermanReqDot } from "@/components/chips";
import { dismissScoutJob, importScoutJobs, restoreScoutJob } from "@/lib/import";
import { openNewApplication } from "@/lib/ui-events";
import { fmtRelative } from "@/lib/format";
import type { ScoutJob } from "@/lib/db/schema";

type Tab = "new" | "dismissed" | "promoted";

export function TriageInbox({
  jobs,
  tab,
  counts,
}: {
  jobs: ScoutJob[];
  tab: Tab;
  counts: Record<Tab, number>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function runImport() {
    startTransition(async () => {
      const res = await importScoutJobs();
      if (res.ok) {
        toast.success(
          `Scout import: ${res.imported} new, ${res.updated} refreshed (${res.total} scanned)`,
        );
        router.refresh();
      } else {
        toast.error(res.error ?? "Import failed.");
      }
    });
  }

  function promote(job: ScoutJob) {
    openNewApplication({
      company: job.company ?? "",
      roleTitle: job.title ?? "",
      source: job.source ?? "scraper",
      fitScore: job.score ?? undefined,
      germanReq: job.languageFlag ?? "unknown",
      applyUrl: job.url ?? "",
      notes: job.reason ?? "",
      status: "to_apply",
      scoutJobId: job.id,
    });
  }

  function dismiss(id: string) {
    startTransition(async () => {
      try {
        await dismissScoutJob(id);
        router.refresh();
      } catch {
        toast.error("Couldn't dismiss.");
      }
    });
  }

  function restore(id: string) {
    startTransition(async () => {
      try {
        await restoreScoutJob(id);
        router.refresh();
      } catch {
        toast.error("Couldn't restore.");
      }
    });
  }

  const TABS: { key: Tab; label: string }[] = [
    { key: "new", label: "New" },
    { key: "dismissed", label: "Dismissed" },
    { key: "promoted", label: "Promoted" },
  ];

  return (
    <div>
      {/* toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-hairline bg-white/[0.02] p-0.5">
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={t.key === "new" ? "/triage" : `/triage?tab=${t.key}`}
              className={cn(
                "rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors",
                tab === t.key
                  ? "bg-elevated text-foreground"
                  : "text-ink-3 hover:text-ink-2",
              )}
            >
              {t.label}
              <span className="tnum ml-1.5 text-[11px] text-ink-3">{counts[t.key]}</span>
            </Link>
          ))}
        </div>

        <button
          type="button"
          onClick={runImport}
          disabled={pending}
          className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-lg border-0 bg-[linear-gradient(135deg,#7c6bf5,#4e7df0)] px-3.5 text-sm font-semibold text-white shadow-[0_0_0_1px_rgba(155,140,255,0.35)] transition-[filter] hover:brightness-110 disabled:opacity-50"
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <DownloadCloud className="size-4" />
          )}
          Import from scout
        </button>
      </div>

      {/* rows */}
      {jobs.length === 0 ? (
        <EmptyTriage tab={tab} onImport={runImport} pending={pending} />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-hairline bg-card">
          {jobs.map((job) => (
            <div
              key={job.id}
              className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-hairline/60 px-4 py-3 last:border-0 sm:flex-nowrap"
            >
              <FitChip score={job.score} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[13.5px] font-semibold text-foreground">
                    {job.company ?? "—"}
                  </span>
                  <span className="truncate text-[13px] text-ink-2">{job.title}</span>
                  <GermanReqDot req={job.languageFlag === "unknown" ? "unknown" : job.languageFlag} />
                </div>
                {job.reason && (
                  <p className="mt-0.5 truncate text-[12px] text-ink-3">{job.reason}</p>
                )}
              </div>

              <span className="tnum shrink-0 text-[11px] text-ink-3">
                {job.source ?? "—"} · {job.firstSeen ? fmtRelative(job.firstSeen) : "—"}
              </span>

              <div className="flex shrink-0 items-center gap-1.5">
                {job.url && (
                  <a
                    href={job.url}
                    target="_blank"
                    rel="noreferrer"
                    className="grid size-8 place-items-center rounded-lg border border-hairline text-ink-3 transition-colors hover:border-white/15 hover:text-foreground"
                    aria-label="Open posting"
                    title="Open posting"
                  >
                    <ExternalLink className="size-3.5" />
                  </a>
                )}
                {tab === "new" && (
                  <>
                    <button
                      type="button"
                      onClick={() => promote(job)}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border-0 bg-[linear-gradient(135deg,#7c6bf5,#4e7df0)] px-2.5 text-[12px] font-semibold text-white shadow-[0_0_0_1px_rgba(155,140,255,0.3)] hover:brightness-110"
                    >
                      <ArrowUpRight className="size-3.5" /> Promote
                    </button>
                    <button
                      type="button"
                      onClick={() => dismiss(job.id)}
                      disabled={pending}
                      className="inline-flex h-8 items-center gap-1 rounded-lg border border-hairline px-2.5 text-[12px] font-medium text-ink-3 transition-colors hover:border-white/15 hover:text-foreground disabled:opacity-50"
                    >
                      <X className="size-3.5" /> Dismiss
                    </button>
                  </>
                )}
                {tab === "dismissed" && (
                  <button
                    type="button"
                    onClick={() => restore(job.id)}
                    disabled={pending}
                    className="inline-flex h-8 items-center gap-1 rounded-lg border border-hairline px-2.5 text-[12px] font-medium text-ink-3 transition-colors hover:border-white/15 hover:text-foreground disabled:opacity-50"
                  >
                    <Undo2 className="size-3.5" /> Restore
                  </button>
                )}
                {tab === "promoted" && job.promotedApplicationId && (
                  <Link
                    href={`/a/${job.promotedApplicationId}`}
                    className="inline-flex h-8 items-center gap-1 rounded-lg border border-hairline px-2.5 text-[12px] font-medium text-ink-2 transition-colors hover:border-white/15 hover:text-foreground"
                  >
                    Open application <ArrowUpRight className="size-3.5" />
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyTriage({
  tab,
  onImport,
  pending,
}: {
  tab: Tab;
  onImport: () => void;
  pending: boolean;
}) {
  return (
    <div className="flex min-h-[40dvh] flex-col items-center justify-center rounded-2xl border border-dashed border-hairline px-6 py-12 text-center">
      <span className="relative grid size-14 place-items-center rounded-2xl border border-hairline bg-card">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-2xl opacity-70 blur-xl"
          style={{ background: "radial-gradient(circle, rgba(124,107,245,0.25), transparent 70%)" }}
        />
        <Inbox className="relative size-6 text-accent-hi" />
      </span>
      <h2 className="mt-5 text-lg font-semibold tracking-tight text-foreground">
        {tab === "new" ? "Inbox zero" : tab === "dismissed" ? "Nothing dismissed" : "Nothing promoted yet"}
      </h2>
      <p className="mt-2 max-w-[380px] text-sm text-ink-2">
        {tab === "new"
          ? "Run an import to pull the latest roles your scout found."
          : tab === "dismissed"
            ? "Jobs you pass on land here — restorable anytime."
            : "Promote a scouted job and it moves onto the board as a real application."}
      </p>
      {tab === "new" && (
        <button
          type="button"
          onClick={onImport}
          disabled={pending}
          className="mt-5 inline-flex h-9 items-center gap-1.5 rounded-lg border-0 bg-[linear-gradient(135deg,#7c6bf5,#4e7df0)] px-3.5 text-sm font-semibold text-white shadow-[0_0_0_1px_rgba(155,140,255,0.35)] hover:brightness-110 disabled:opacity-50"
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : <DownloadCloud className="size-4" />}
          Import from scout
        </button>
      )}
    </div>
  );
}

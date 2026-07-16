"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  Ban,
  Copy,
  DownloadCloud,
  ExternalLink,
  FileText,
  Loader2,
  Search,
  Sparkles,
  Telescope,
  Undo2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  FIT_BAND_META,
  GERMAN_REQ_META,
  deriveFitBand,
  sourceLabel,
  type GermanReq,
} from "@/lib/constants";
import { applyToScoutJob } from "@/lib/actions";
import { dismissScoutJob, importScoutJobs, restoreScoutJob } from "@/lib/import";
import { fetchJson } from "@/lib/fetch-json";
import { fmtRelative } from "@/lib/format";
import type { ScoutJob } from "@/lib/db/schema";

type Tab = "new" | "dismissed" | "promoted";

const TABS: { key: Tab; label: string }[] = [
  { key: "new", label: "Open roles" },
  { key: "promoted", label: "Applied" },
  { key: "dismissed", label: "Passed" },
];

const FIT_FILTERS: { key: string; label: string; min: number }[] = [
  { key: "all", label: "All fits", min: 0 },
  { key: "strong", label: "Strong", min: 75 },
  { key: "stretch", label: "Stretch+", min: 50 },
];

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

function lang(flag: string | null | undefined) {
  return GERMAN_REQ_META[(flag ?? "unknown") as GermanReq] ?? GERMAN_REQ_META.unknown;
}

function bandFor(score: number | null | undefined) {
  const band = deriveFitBand(score);
  return band ? FIT_BAND_META[band] : { label: "Unscored", color: "#666b7d" };
}

/* ---- Score ring — conic gauge, colored by fit band --------------------- */
function ScoreRing({ score, size = 64 }: { score: number | null | undefined; size?: number }) {
  const meta = bandFor(score);
  const pct = Math.max(0, Math.min(100, score ?? 0));
  const inner = size - 12;
  return (
    <div
      className="relative grid shrink-0 place-items-center rounded-full"
      style={{
        width: size,
        height: size,
        background: `conic-gradient(${meta.color} ${pct * 3.6}deg, rgba(255,255,255,0.07) 0deg)`,
      }}
    >
      <div
        className="grid place-items-center rounded-full bg-card"
        style={{ width: inner, height: inner }}
      >
        <span className="tnum text-lg font-semibold leading-none" style={{ color: meta.color }}>
          {score ?? "—"}
        </span>
      </div>
    </div>
  );
}

/* ---- List row ---------------------------------------------------------- */
function JobRow({
  job,
  active,
  onSelect,
  innerRef,
}: {
  job: ScoutJob;
  active: boolean;
  onSelect: () => void;
  innerRef: (el: HTMLButtonElement | null) => void;
}) {
  const band = bandFor(job.score);
  const l = lang(job.languageFlag);
  return (
    <button
      ref={innerRef}
      type="button"
      onClick={onSelect}
      aria-current={active ? "true" : undefined}
      className={cn(
        "group relative flex w-full items-start gap-3 border-b border-hairline/60 px-4 py-3.5 text-left transition-colors last:border-0",
        active ? "bg-elevated" : "hover:bg-white/[0.025]",
      )}
    >
      {active && (
        <span className="absolute left-0 top-1/2 h-8 w-0.5 -translate-y-1/2 rounded-full bg-primary" />
      )}
      <span
        className="tnum mt-0.5 inline-flex h-7 min-w-9 items-center justify-center rounded-md px-1.5 text-[12px] font-semibold"
        style={{ color: band.color, background: `color-mix(in oklab, ${band.color} 14%, transparent)` }}
      >
        {job.score ?? "—"}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-[13.5px] font-semibold text-foreground">
            {job.company ?? "—"}
          </span>
          <span
            className="ml-auto size-1.5 shrink-0 rounded-full"
            style={{ background: l.color }}
            title={l.label}
          />
        </span>
        <span className="mt-0.5 block truncate text-[12.5px] text-ink-2">{job.title}</span>
        <span className="mt-1 flex items-center gap-1.5 text-[11px] text-ink-3">
          <span className="truncate">{sourceLabel(job.source)}</span>
          <span aria-hidden>·</span>
          <span className="shrink-0">{job.firstSeen ? fmtRelative(job.firstSeen) : "—"}</span>
        </span>
      </span>
    </button>
  );
}

/* ---- Job description (JOBDASH-006 §2) ----------------------------------
   Cached JD text renders in a pre-wrap panel with its own scroll; otherwise a
   Load button POSTs /api/scout-jd/[id] (fetch → cache → return). */
function JdPanel({ job }: { job: ScoutJob }) {
  const router = useRouter();
  const [text, setText] = useState<string | null>(job.jdText ?? null);
  const [loading, startLoad] = useTransition();

  // Selection changes reuse this mounted panel — track the row's cache.
  useEffect(() => {
    setText(job.jdText ?? null);
  }, [job.id, job.jdText]);

  function load() {
    startLoad(async () => {
      try {
        const res = await fetchJson<{ ok: boolean; text?: string; error?: string }>(
          `/api/scout-jd/${job.id}`,
          { method: "POST" },
        );
        if (!res.ok || !res.text) throw new Error(res.error || "Couldn't load the description.");
        setText(res.text);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't load the description.");
      }
    });
  }

  async function copyJd() {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      toast.success("JD copied");
    } catch {
      toast.error("Clipboard unavailable — select the text and copy manually.");
    }
  }

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-3">
          <FileText className="size-3.5" />
          Job description
          {text && job.jdFetchedAt && (
            <span className="font-normal normal-case tracking-normal">
              · fetched {fmtRelative(job.jdFetchedAt)}
            </span>
          )}
        </h3>
        {text && (
          <button
            type="button"
            onClick={copyJd}
            className="inline-flex items-center gap-1.5 rounded-lg border border-hairline px-2.5 py-1 text-[11.5px] font-medium text-ink-2 transition-colors hover:border-white/15 hover:text-foreground"
          >
            <Copy className="size-3.5" /> Copy
          </button>
        )}
      </div>

      {text ? (
        <div className="mt-2 max-h-[38dvh] overflow-y-auto rounded-xl border border-hairline bg-white/[0.015] px-4 py-3">
          <pre className="whitespace-pre-wrap font-sans text-[12.5px] leading-relaxed text-ink-2">
            {text}
          </pre>
        </div>
      ) : loading ? (
        <div className="mt-2 space-y-2 rounded-xl border border-hairline px-4 py-3.5" aria-label="Loading description">
          {[92, 100, 84, 68].map((w) => (
            <div key={w} className="h-3 animate-pulse rounded bg-white/[0.06]" style={{ width: `${w}%` }} />
          ))}
        </div>
      ) : (
        <button
          type="button"
          onClick={load}
          className="mt-2 inline-flex h-9 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-hairline text-[12.5px] font-medium text-ink-2 transition-colors hover:border-white/20 hover:text-foreground"
        >
          <FileText className="size-4" /> Load description from posting
        </button>
      )}
    </div>
  );
}

/* ---- Detail pane ------------------------------------------------------- */
function JobDetail({
  job,
  tab,
  pending,
  onApply,
  onDismiss,
  onRestore,
}: {
  job: ScoutJob;
  tab: Tab;
  pending: boolean;
  onApply: (job: ScoutJob) => void;
  onDismiss: (job: ScoutJob) => void;
  onRestore: (job: ScoutJob) => void;
}) {
  const band = bandFor(job.score);
  const l = lang(job.languageFlag);

  return (
    <div className="flex max-h-[calc(100dvh-104px)] flex-col overflow-hidden rounded-2xl border border-hairline bg-card">
      {/* header */}
      <div className="flex items-start gap-4 border-b border-hairline px-5 py-5 md:px-6">
        <ScoreRing score={job.score} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[15px] font-semibold text-foreground">
              {job.company ?? "—"}
            </span>
            <span
              className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
              style={{ color: band.color, background: `color-mix(in oklab, ${band.color} 14%, transparent)` }}
            >
              {band.label}
            </span>
          </div>
          <h2 className="mt-1 text-lg font-semibold leading-snug tracking-tight text-foreground">
            {job.title}
          </h2>
          <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12px] text-ink-3">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-1.5 rounded-full" style={{ background: l.color }} />
              <span className="text-ink-2">{l.label}</span>
            </span>
            <span aria-hidden>·</span>
            <span>{sourceLabel(job.source)}</span>
            <span aria-hidden>·</span>
            <span>Spotted {job.firstSeen ? fmtRelative(job.firstSeen) : "—"}</span>
          </div>
        </div>
      </div>

      {/* scrollable body */}
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 md:px-6">
        {job.reason ? (
          <div className="relative overflow-hidden rounded-xl border border-primary/25 bg-primary/[0.06] p-4">
            <div
              aria-hidden
              className="pointer-events-none absolute -right-6 -top-8 size-24 rounded-full opacity-60 blur-2xl"
              style={{ background: "radial-gradient(circle, rgba(124,107,245,0.4), transparent 70%)" }}
            />
            <div className="relative flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-accent-hi">
              <Sparkles className="size-3.5" />
              Why you match
            </div>
            <p className="relative mt-2 text-[13.5px] leading-relaxed text-foreground/90">
              {job.reason}
            </p>
          </div>
        ) : (
          <p className="text-[13px] text-ink-3">
            No match rationale on this role yet — open the posting to review it.
          </p>
        )}

        <JdPanel job={job} />

        <dl className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-hairline bg-hairline">
          <Cell label="Fit score" value={job.score != null ? `${job.score} / 100` : "—"} tone={band.color} />
          <Cell label="Language" value={l.label} tone={l.color} />
          <Cell label="Source" value={sourceLabel(job.source)} />
          <Cell label="First seen" value={job.firstSeen ? fmtRelative(job.firstSeen) : "—"} />
        </dl>

        {tab === "promoted" && job.promotedApplicationId && (
          <div className="mt-4 rounded-xl border border-hairline bg-elevated/60 px-4 py-3 text-[12.5px] text-ink-2">
            This role is on your board.{" "}
            <Link
              href={`/a/${job.promotedApplicationId}`}
              className="font-medium text-accent-hi hover:underline"
            >
              Open the application →
            </Link>
          </div>
        )}
      </div>

      {/* action footer */}
      <div className="border-t border-hairline px-5 py-4 md:px-6">
        {tab === "new" && (
          <>
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => onApply(job)}
                disabled={pending}
                className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl border-0 bg-[linear-gradient(135deg,#7c6bf5,#4e7df0)] px-4 text-sm font-semibold text-white shadow-[0_0_0_1px_rgba(155,140,255,0.35),0_10px_28px_-12px_rgba(124,107,245,0.75)] transition-[filter] hover:brightness-110 disabled:opacity-60"
              >
                {pending ? <Loader2 className="size-4 animate-spin" /> : <ArrowUpRight className="size-4" strokeWidth={2.5} />}
                Apply — opens posting
              </button>
              <button
                type="button"
                onClick={() => onDismiss(job)}
                disabled={pending}
                className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-hairline px-3.5 text-sm font-medium text-ink-2 transition-colors hover:border-white/15 hover:text-foreground disabled:opacity-50"
                title="Not interested"
              >
                <Ban className="size-4" /> Pass
              </button>
              {job.url && <ViewPostingLink url={job.url} label="Open posting" />}
            </div>
            <p className="mt-2.5 text-center text-[11px] text-ink-3">
              Applying opens the posting in a new tab and adds it to your board as{" "}
              <span className="text-ink-2">To apply</span>.
            </p>
          </>
        )}

        {tab === "dismissed" && (
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => onRestore(job)}
              disabled={pending}
              className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl border border-hairline text-sm font-medium text-foreground transition-colors hover:border-white/15 disabled:opacity-50"
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Undo2 className="size-4" />}
              Restore to open roles
            </button>
            {job.url && <ViewPostingLink url={job.url} />}
          </div>
        )}

        {tab === "promoted" && (
          <div className="flex items-center gap-2.5">
            {job.promotedApplicationId && (
              <Link
                href={`/a/${job.promotedApplicationId}`}
                className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl border-0 bg-[linear-gradient(135deg,#7c6bf5,#4e7df0)] px-4 text-sm font-semibold text-white shadow-[0_0_0_1px_rgba(155,140,255,0.35)] transition-[filter] hover:brightness-110"
              >
                View on board <ArrowUpRight className="size-4" strokeWidth={2.5} />
              </Link>
            )}
            {job.url && <ViewPostingLink url={job.url} />}
          </div>
        )}
      </div>
    </div>
  );
}

function Cell({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="bg-card px-3.5 py-3">
      <dt className="text-[10.5px] font-medium uppercase tracking-[0.1em] text-ink-3">{label}</dt>
      <dd className="mt-1 truncate text-[13px] font-medium" style={{ color: tone ?? "var(--foreground)" }}>
        {value}
      </dd>
    </div>
  );
}

function ViewPostingLink({ url, label = "Posting" }: { url: string; label?: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-hairline px-3.5 text-sm font-medium text-ink-2 transition-colors hover:border-white/15 hover:text-foreground"
    >
      <ExternalLink className="size-4" /> {label}
    </a>
  );
}

/* ---- Main board -------------------------------------------------------- */
export function JobBoard({
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
  const [selectedId, setSelectedId] = useState<string | null>(jobs[0]?.id ?? null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [fit, setFit] = useState("all");
  const [englishOnly, setEnglishOnly] = useState(false);
  const rowRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const min = FIT_FILTERS.find((f) => f.key === fit)?.min ?? 0;
    return jobs.filter((j) => {
      if (min > 0 && (j.score ?? -1) < min) return false;
      if (englishOnly && lang(j.languageFlag).tone !== "English-first") return false;
      if (q) {
        const hay = `${j.company ?? ""} ${j.title ?? ""} ${j.reason ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [jobs, query, fit, englishOnly]);

  // Keep a valid selection as the filtered set changes.
  const selected =
    filtered.find((j) => j.id === selectedId) ?? filtered[0] ?? null;
  useEffect(() => {
    if (selected && selected.id !== selectedId) setSelectedId(selected.id);
  }, [selected, selectedId]);

  // Scroll the active row into view when selection moves.
  useEffect(() => {
    if (!selectedId) return;
    rowRefs.current.get(selectedId)?.scrollIntoView({ block: "nearest" });
  }, [selectedId]);

  function select(id: string) {
    setSelectedId(id);
    setMobileOpen(true);
  }

  function step(delta: number) {
    if (filtered.length === 0) return;
    const idx = filtered.findIndex((j) => j.id === selectedId);
    const next = filtered[Math.max(0, Math.min(filtered.length - 1, (idx < 0 ? 0 : idx) + delta))];
    if (next) setSelectedId(next.id);
  }

  // Advance to a neighbour before the acted-on job leaves the list.
  function advancePast(id: string) {
    const idx = filtered.findIndex((j) => j.id === id);
    const next = filtered[idx + 1] ?? filtered[idx - 1] ?? null;
    setSelectedId(next ? next.id : null);
  }

  function apply(job: ScoutJob) {
    // Open synchronously to keep the user-gesture (avoids popup blocking).
    if (job.url) window.open(job.url, "_blank", "noopener,noreferrer");
    advancePast(job.id);
    startTransition(async () => {
      try {
        const res = await applyToScoutJob(job.id);
        toast.success(
          res.reused
            ? `${job.company ?? "Role"} is already on your board — posting reopened`
            : `Applied — ${job.company ?? "role"} added to your board`,
          { action: { label: "View", onClick: () => router.push(`/a/${res.id}`) } },
        );
        setMobileOpen(false);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't apply.");
      }
    });
  }

  function dismiss(job: ScoutJob) {
    advancePast(job.id);
    startTransition(async () => {
      try {
        await dismissScoutJob(job.id);
        setMobileOpen(false);
        router.refresh();
      } catch {
        toast.error("Couldn't pass on that role.");
      }
    });
  }

  function restore(job: ScoutJob) {
    advancePast(job.id);
    startTransition(async () => {
      try {
        await restoreScoutJob(job.id);
        setMobileOpen(false);
        router.refresh();
      } catch {
        toast.error("Couldn't restore.");
      }
    });
  }

  function runImport() {
    startTransition(async () => {
      const res = await importScoutJobs();
      if (res.ok) {
        toast.success(`Scout import: ${res.imported} new, ${res.updated} refreshed (${res.total} scanned)`);
        router.refresh();
      } else {
        toast.error(res.error ?? "Import failed.");
      }
    });
  }

  // Keyboard: j/k or ↑/↓ move · a/Enter apply · x pass (Otta-style flow).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return;
      const k = e.key.toLowerCase();
      if (k === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        step(1);
      } else if (k === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        step(-1);
      } else if (tab === "new" && selected && (k === "a" || (e.key === "Enter" && !(e.target instanceof HTMLButtonElement || e.target instanceof HTMLAnchorElement)))) {
        e.preventDefault();
        apply(selected);
      } else if (tab === "new" && selected && k === "x") {
        e.preventDefault();
        dismiss(selected);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, selectedId, tab]);

  return (
    <div className="space-y-4">
      {/* tabs + import */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-hairline bg-white/[0.02] p-0.5">
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={t.key === "new" ? "/triage" : `/triage?tab=${t.key}`}
              className={cn(
                "rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors",
                tab === t.key ? "bg-elevated text-foreground" : "text-ink-3 hover:text-ink-2",
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
          {pending ? <Loader2 className="size-4 animate-spin" /> : <DownloadCloud className="size-4" />}
          Import from scout
        </button>
      </div>

      {jobs.length === 0 ? (
        <EmptyState tab={tab} onImport={runImport} pending={pending} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(320px,384px)_minmax(0,1fr)]">
          {/* LEFT — filters + list */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <div className="flex h-9 flex-1 items-center gap-2 rounded-lg border border-hairline bg-white/[0.02] px-3 text-sm focus-within:border-white/15">
                <Search className="size-4 shrink-0 text-ink-3" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Filter roles…"
                  className="w-full bg-transparent text-ink-2 placeholder:text-ink-3 focus:outline-none"
                />
                {query && (
                  <button type="button" onClick={() => setQuery("")} aria-label="Clear" className="text-ink-3 hover:text-ink-2">
                    <X className="size-3.5" />
                  </button>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <div className="flex rounded-lg border border-hairline bg-white/[0.02] p-0.5">
                {FIT_FILTERS.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setFit(f.key)}
                    className={cn(
                      "rounded-md px-2.5 py-1 text-[11.5px] font-medium transition-colors",
                      fit === f.key ? "bg-elevated text-foreground" : "text-ink-3 hover:text-ink-2",
                    )}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setEnglishOnly((v) => !v)}
                aria-pressed={englishOnly}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11.5px] font-medium transition-colors",
                  englishOnly
                    ? "border-[color-mix(in_oklab,var(--fit-strong)_40%,transparent)] bg-[color-mix(in_oklab,var(--fit-strong)_12%,transparent)] text-[var(--fit-strong)]"
                    : "border-hairline text-ink-3 hover:text-ink-2",
                )}
              >
                <span className="size-1.5 rounded-full bg-current" /> English-first
              </button>
            </div>

            <div className="overflow-hidden rounded-2xl border border-hairline bg-card">
              <div className="max-h-[64dvh] overflow-y-auto lg:max-h-[calc(100dvh-232px)]">
                {filtered.length === 0 ? (
                  <NoMatch onClear={() => { setQuery(""); setFit("all"); setEnglishOnly(false); }} />
                ) : (
                  filtered.map((job) => (
                    <JobRow
                      key={job.id}
                      job={job}
                      active={selected?.id === job.id}
                      onSelect={() => select(job.id)}
                      innerRef={(el) => {
                        if (el) rowRefs.current.set(job.id, el);
                        else rowRefs.current.delete(job.id);
                      }}
                    />
                  ))
                )}
              </div>
              {filtered.length > 0 && (
                <div className="flex items-center justify-between border-t border-hairline px-4 py-2 text-[11px] text-ink-3">
                  <span className="tnum">{filtered.length} of {jobs.length}</span>
                  <span className="hidden lg:inline">
                    <kbd className="font-mono">j</kbd>/<kbd className="font-mono">k</kbd> move ·{" "}
                    <kbd className="font-mono">a</kbd> apply · <kbd className="font-mono">x</kbd> pass
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* RIGHT — detail (inline, lg+) */}
          <div className="hidden lg:block">
            <div className="sticky top-[76px]">
              {selected ? (
                <JobDetail
                  job={selected}
                  tab={tab}
                  pending={pending}
                  onApply={apply}
                  onDismiss={dismiss}
                  onRestore={restore}
                />
              ) : (
                <SelectPrompt />
              )}
            </div>
          </div>
        </div>
      )}

      {/* MOBILE — detail overlay */}
      {mobileOpen && selected && (
        <div className="fixed inset-0 z-50 flex flex-col bg-background lg:hidden">
          <div className="flex h-14 shrink-0 items-center gap-3 border-b border-hairline px-4">
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="grid size-9 place-items-center rounded-lg border border-hairline text-ink-2"
              aria-label="Back to list"
            >
              <ArrowLeft className="size-4" />
            </button>
            <span className="truncate text-sm font-semibold text-foreground">{selected.company}</span>
          </div>
          <div className="min-h-0 flex-1 p-4">
            <JobDetail
              job={selected}
              tab={tab}
              pending={pending}
              onApply={apply}
              onDismiss={dismiss}
              onRestore={restore}
            />
          </div>
        </div>
      )}
    </div>
  );
}

/* ---- Empty / placeholder states --------------------------------------- */
function SelectPrompt() {
  return (
    <div className="flex min-h-[52dvh] flex-col items-center justify-center rounded-2xl border border-dashed border-hairline text-center">
      <Telescope className="size-7 text-ink-3" />
      <p className="mt-3 text-sm text-ink-2">Pick a role to see the full match.</p>
    </div>
  );
}

function NoMatch({ onClear }: { onClear: () => void }) {
  return (
    <div className="flex min-h-[40dvh] flex-col items-center justify-center px-6 py-12 text-center">
      <Search className="size-6 text-ink-3" />
      <p className="mt-3 text-sm text-ink-2">No roles match your filters.</p>
      <button
        type="button"
        onClick={onClear}
        className="mt-3 rounded-lg border border-hairline px-3 py-1.5 text-[12px] font-medium text-ink-2 hover:border-white/15 hover:text-foreground"
      >
        Clear filters
      </button>
    </div>
  );
}

function EmptyState({ tab, onImport, pending }: { tab: Tab; onImport: () => void; pending: boolean }) {
  const copy = {
    new: {
      title: "No open roles right now",
      body: "Run an import to pull the latest roles your scout found — the strongest matches surface first.",
    },
    dismissed: { title: "Nothing passed", body: "Roles you pass on land here — restorable anytime." },
    promoted: { title: "Nothing applied yet", body: "Apply to a role and it moves onto your board as a tracked application." },
  }[tab];
  return (
    <div className="flex min-h-[52dvh] flex-col items-center justify-center rounded-2xl border border-dashed border-hairline px-6 py-14 text-center">
      <span className="relative grid size-14 place-items-center rounded-2xl border border-hairline bg-card">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-2xl opacity-70 blur-xl"
          style={{ background: "radial-gradient(circle, rgba(124,107,245,0.25), transparent 70%)" }}
        />
        <Telescope className="relative size-6 text-accent-hi" />
      </span>
      <h2 className="mt-5 text-lg font-semibold tracking-tight text-foreground">{copy.title}</h2>
      <p className="mt-2 max-w-[380px] text-sm text-ink-2">{copy.body}</p>
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

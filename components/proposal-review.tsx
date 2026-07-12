"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRightLeft,
  Check,
  FilePlus2,
  Loader2,
  type LucideProps,
  MailCheck,
  MessageSquareText,
  RefreshCw,
  X,
} from "lucide-react";
import { toast } from "sonner";
import type { ComponentType } from "react";
import { cn } from "@/lib/utils";
import { fmtRelative } from "@/lib/format";
import { acceptProposalAction, dismissProposalAction } from "@/lib/actions";
import type { PendingProposal } from "@/lib/queries";
import type { ProposalPayload } from "@/lib/email/propose";

const TYPE_META: Record<
  string,
  { icon: ComponentType<LucideProps>; label: string; color: string }
> = {
  add_application: { icon: FilePlus2, label: "New application", color: "#9b8cff" },
  set_status: { icon: ArrowRightLeft, label: "Status change", color: "#fbb03b" },
  log_activity: { icon: MessageSquareText, label: "Log activity", color: "#5b8def" },
  set_first_response: { icon: MailCheck, label: "First response", color: "#17c08a" },
};

const FLAG_META: Record<string, { label: string; color: string }> = {
  lowConfidence: { label: "Low confidence — review", color: "#fbb03b" },
  downgrade: { label: "Moves status backwards", color: "#fb5473" },
  reopens: { label: "Reopens closed app", color: "#fb5473" },
  unmatched: { label: "No matching application", color: "#8a8fa3" },
};

function tint(hex: string, alpha: number) {
  return `color-mix(in oklab, ${hex} ${alpha}%, transparent)`;
}

export function ProposalCard({ item }: { item: PendingProposal }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [action, setAction] = useState<"accept" | "dismiss" | null>(null);

  const p = item.proposal;
  const payload = p.payload as ProposalPayload;
  const meta = TYPE_META[p.type] ?? TYPE_META.log_activity;
  const Icon = meta.icon;
  const flags = Object.entries(payload.flags ?? {}).filter(([, v]) => v);
  const confidence = Math.round(p.confidence * 100);

  function run(kind: "accept" | "dismiss") {
    setAction(kind);
    startTransition(async () => {
      try {
        if (kind === "accept") {
          await acceptProposalAction(p.id);
          toast.success(`Applied: ${payload.summary}`);
        } else {
          await dismissProposalAction(p.id);
          toast("Dismissed", { description: payload.summary });
        }
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Action failed.");
      } finally {
        setAction(null);
      }
    });
  }

  return (
    <div className="group rounded-2xl border border-hairline bg-card p-4 transition-colors animate-in fade-in slide-in-from-bottom-1 duration-300 hover:border-white/12 motion-reduce:animate-none">
      <div className="flex flex-wrap items-start gap-3">
        <span
          className="grid size-9 shrink-0 place-items-center rounded-xl"
          style={{ background: tint(meta.color, 12) }}
        >
          <Icon className="size-[18px]" style={{ color: meta.color }} />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="rounded-full border px-2 py-0.5 text-[11px] font-medium"
              style={{
                color: meta.color,
                borderColor: tint(meta.color, 28),
                background: tint(meta.color, 10),
              }}
            >
              {meta.label}
            </span>
            <span className="tnum text-[11px] text-ink-3">{confidence}% confident</span>
            {flags.map(([key]) => {
              const f = FLAG_META[key];
              if (!f) return null;
              return (
                <span
                  key={key}
                  className="rounded-full border px-2 py-0.5 text-[11px] font-medium"
                  style={{
                    color: f.color,
                    borderColor: tint(f.color, 28),
                    background: tint(f.color, 10),
                  }}
                >
                  {f.label}
                </span>
              );
            })}
          </div>

          <p className="mt-1.5 text-sm font-semibold text-foreground">{payload.summary}</p>

          {payload.evidence && (
            <blockquote className="mt-2 border-l-2 border-primary/40 pl-3 text-[12.5px] leading-relaxed text-ink-2">
              “{payload.evidence}”
            </blockquote>
          )}

          <p className="mt-2 truncate text-[11px] text-ink-3">
            {item.email.sender}
            {item.email.subject ? <span className="text-ink-3"> — {item.email.subject}</span> : null}
            <span className="tnum"> · {fmtRelative(item.email.receivedAt)}</span>
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2 self-center">
          <button
            type="button"
            disabled={pending}
            onClick={() => run("dismiss")}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-hairline px-3 text-xs font-medium text-ink-2 transition-colors hover:border-white/15 hover:text-foreground disabled:opacity-50"
          >
            {pending && action === "dismiss" ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <X className="size-3.5" />
            )}
            Dismiss
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => run("accept")}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border-0 bg-[linear-gradient(135deg,#7c6bf5,#4e7df0)] px-3.5 text-xs font-semibold text-white shadow-[0_0_0_1px_rgba(155,140,255,0.35),0_8px_24px_-10px_rgba(124,107,245,0.7)] transition-[filter] hover:brightness-110 disabled:opacity-50"
          >
            {pending && action === "accept" ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Check className="size-3.5" strokeWidth={2.5} />
            )}
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}

/** Runs POST /api/sync — can take minutes when new emails need classification. */
export function SyncButton({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);

  async function run() {
    setRunning(true);
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      const body = (await res.json()) as {
        ok: boolean;
        error?: string;
        classified?: number;
        proposals?: number;
        autoApplied?: number;
      };
      if (!body.ok) throw new Error(body.error ?? "sync failed");
      toast.success("Sync complete", {
        description: `${body.classified ?? 0} classified · ${body.proposals ?? 0} proposals · ${body.autoApplied ?? 0} auto-logged`,
      });
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sync failed.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <button
      type="button"
      disabled={running}
      onClick={run}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border border-hairline bg-white/[0.02] font-medium text-ink-2 transition-colors hover:border-white/15 hover:text-foreground disabled:opacity-60",
        compact ? "h-7 px-2.5 text-[11px]" : "h-9 px-3.5 text-xs",
      )}
    >
      <RefreshCw className={cn("size-3.5", running && "animate-spin")} />
      {running ? "Syncing…" : "Sync now"}
    </button>
  );
}

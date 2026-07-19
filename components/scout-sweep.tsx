"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ScanSearch, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { fetchJson } from "@/lib/fetch-json";
import type { ScoutSweepStats } from "@/lib/scout-sweep";

const BTN =
  "inline-flex h-9 items-center gap-1.5 rounded-lg border border-hairline bg-white/[0.02] px-3.5 text-xs font-medium text-ink-2 transition-colors hover:border-white/15 hover:text-foreground disabled:opacity-60";

/** Discover header controls (JOBDASH-007): sweep Open roles for dead postings
 * (they flip to a hidden `expired` status), then clear the flagged rows. */
export function ScoutSweep({ expiredCount }: { expiredCount: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"sweep" | "clear" | null>(null);

  async function sweep() {
    setBusy("sweep");
    try {
      const body = await fetchJson<{ ok: boolean; error?: string } & ScoutSweepStats>(
        "/api/scout-sweep",
        { method: "POST" },
      );
      if (!body.ok) throw new Error(body.error ?? "sweep failed");
      const rest = body.remaining > 0 ? ` · ${body.remaining} not yet checked — sweep again` : "";
      if (body.expired > 0) {
        const extra = body.expiredJobs.length - 6;
        toast.warning(
          `${body.expired} role${body.expired === 1 ? "" : "s"} expired — hidden from Discover`,
          {
            description:
              body.expiredJobs.slice(0, 6).join(" · ") +
              (extra > 0 ? ` · +${extra} more` : "") +
              rest,
          },
        );
      } else {
        toast.success("All checked roles still live", {
          description: `${body.live} live · ${body.unknown} unverifiable of ${body.checked} checked${rest}`,
        });
      }
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sweep failed.");
    } finally {
      setBusy(null);
    }
  }

  async function clearExpired() {
    setBusy("clear");
    try {
      const body = await fetchJson<{ ok: boolean; error?: string; deleted: number }>(
        "/api/scout-sweep",
        { method: "DELETE" },
      );
      if (!body.ok) throw new Error(body.error ?? "clear failed");
      toast.success(`Deleted ${body.deleted} expired role${body.deleted === 1 ? "" : "s"}`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Clear failed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={busy !== null}
        onClick={sweep}
        title="Probe every open role's posting — verifiably dead ones are hidden (takes a minute or two on a big queue)"
        className={BTN}
      >
        <ScanSearch className={cn("size-3.5", busy === "sweep" && "animate-pulse")} />
        {busy === "sweep" ? "Sweeping…" : "Sweep expired"}
      </button>
      {expiredCount > 0 && (
        <button
          type="button"
          disabled={busy !== null}
          onClick={clearExpired}
          title="Permanently delete the roles the sweep verified as expired"
          className={cn(
            BTN,
            "border-destructive/30 text-destructive hover:border-destructive/60 hover:text-destructive",
          )}
        >
          <Trash2 className="size-3.5" />
          {busy === "clear" ? "Clearing…" : `Clear ${expiredCount} expired`}
        </button>
      )}
    </div>
  );
}

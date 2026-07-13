"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Radar } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { PostingCheckStats } from "@/lib/posting-verdict";

/** Probe open cards' apply URLs; dead postings auto-move to Missed. */
export function CheckPostingsButton({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);

  async function run() {
    setRunning(true);
    try {
      const res = await fetch("/api/check-postings", { method: "POST" });
      const body = (await res.json()) as ({ ok: boolean; error?: string } & PostingCheckStats);
      if (!body.ok) throw new Error(body.error ?? "posting check failed");
      if (body.moved.length > 0) {
        toast.warning(
          `${body.moved.length} posting${body.moved.length === 1 ? "" : "s"} expired → moved to Missed`,
          { description: body.moved.join(" · ") },
        );
      } else {
        toast.success("All postings still live", {
          description: `${body.live} live · ${body.unknown} unverifiable of ${body.checked} checked`,
        });
      }
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Posting check failed.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <button
      type="button"
      disabled={running}
      onClick={run}
      title="Verify open postings are still accepting applications"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border border-hairline bg-white/[0.02] font-medium text-ink-2 transition-colors hover:border-white/15 hover:text-foreground disabled:opacity-60",
        compact ? "h-7 px-2.5 text-[11px]" : "h-9 px-3.5 text-xs",
      )}
    >
      <Radar className={cn("size-3.5", running && "animate-pulse")} />
      {running ? "Checking…" : "Check postings"}
    </button>
  );
}

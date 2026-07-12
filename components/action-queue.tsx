"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import {
  AlarmClock,
  CircleCheckBig,
  ExternalLink,
  Hourglass,
  MailPlus,
  Moon,
  Play,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { FitChip } from "@/components/chips";
import { logFollowUp, moveApplication, snoozeApplication } from "@/lib/actions";
import type { ActionItem, ActionKind } from "@/lib/action-queue";

const KIND_META: Record<
  ActionKind,
  { icon: typeof TriangleAlert; color: string; badge: string }
> = {
  kit_ready: { icon: TriangleAlert, color: "#fb5473", badge: "Send it" },
  overdue: { icon: AlarmClock, color: "#fbb03b", badge: "Nudge" },
  closing: { icon: Hourglass, color: "#fbb03b", badge: "Expiring" },
  next_send: { icon: Play, color: "#9b8cff", badge: "Up next" },
};

export function ActionQueue({ items }: { items: ActionItem[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function run(fn: () => Promise<unknown>, success: string) {
    startTransition(async () => {
      try {
        await fn();
        toast.success(success);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Action failed.");
      }
    });
  }

  if (items.length === 0) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-hairline bg-card px-5 py-6">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#17c08a1f]">
          <CircleCheckBig className="size-5" style={{ color: "#17c08a" }} />
        </span>
        <div>
          <p className="text-sm font-semibold text-foreground">Queue clear</p>
          <p className="text-[12px] text-ink-2">
            Nothing urgent. Check the Scout Inbox for new roles, or add the next application.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {items.map((item) => {
        const meta = KIND_META[item.kind];
        const Icon = meta.icon;
        const a = item.app;
        const red = item.kind === "kit_ready";
        return (
          <div
            key={`${item.kind}-${a.id}`}
            className={cn(
              "group relative flex flex-wrap items-center gap-x-4 gap-y-3 overflow-hidden rounded-2xl border bg-card p-4 transition-colors sm:flex-nowrap",
              red
                ? "border-[#fb547340] hover:border-[#fb547366]"
                : "border-hairline hover:border-white/12",
            )}
          >
            {red && (
              <div
                aria-hidden
                className="pointer-events-none absolute inset-y-0 left-0 w-1"
                style={{ background: meta.color }}
              />
            )}
            <span
              className="grid size-10 shrink-0 place-items-center rounded-xl"
              style={{ background: `color-mix(in oklab, ${meta.color} 14%, transparent)` }}
            >
              <Icon className="size-5" style={{ color: meta.color }} />
            </span>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/a/${a.id}`}
                  className="truncate text-[14px] font-semibold text-foreground hover:text-accent-hi"
                >
                  {a.company}
                </Link>
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                  style={{
                    color: meta.color,
                    background: `color-mix(in oklab, ${meta.color} 12%, transparent)`,
                  }}
                >
                  {item.title}
                </span>
                <FitChip score={a.fitScore} band={a.fitBand} />
              </div>
              <p className="mt-0.5 truncate text-[12px] text-ink-2">
                {a.roleTitle} · {item.detail}
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              {(item.kind === "kit_ready" ||
                item.kind === "closing" ||
                item.kind === "next_send") && (
                <>
                  {a.applyUrl && (
                    <QueueButton
                      title="Open apply link"
                      onClick={() => window.open(a.applyUrl!, "_blank")}
                    >
                      <ExternalLink className="size-3.5" /> Apply
                    </QueueButton>
                  )}
                  <QueueButton
                    primary
                    disabled={pending}
                    title="Move to Applied"
                    onClick={() =>
                      run(() => moveApplication(a.id, "applied"), `${a.company} marked applied`)
                    }
                  >
                    <CircleCheckBig className="size-3.5" /> Mark applied
                  </QueueButton>
                </>
              )}
              {item.kind === "overdue" && (
                <QueueButton
                  primary
                  disabled={pending}
                  title="Record that you sent a follow-up"
                  onClick={() => run(() => logFollowUp(a.id), `Follow-up logged for ${a.company}`)}
                >
                  <MailPlus className="size-3.5" /> Log follow-up
                </QueueButton>
              )}
              <QueueButton
                disabled={pending}
                title="Hide for 3 days"
                onClick={() => run(() => snoozeApplication(a.id, 3), `${a.company} snoozed 3d`)}
              >
                <Moon className="size-3.5" /> Snooze
              </QueueButton>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function QueueButton({
  children,
  onClick,
  title,
  primary = false,
  disabled = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  primary?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12px] font-semibold transition-all disabled:opacity-50",
        primary
          ? "border-0 bg-[linear-gradient(135deg,#7c6bf5,#4e7df0)] text-white shadow-[0_0_0_1px_rgba(155,140,255,0.3)] hover:brightness-110"
          : "border border-hairline text-ink-2 hover:border-white/15 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

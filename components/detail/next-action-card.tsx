"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { CalendarCheck, Check } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { completeNextAction } from "@/lib/actions";
import { InlineField } from "./inline-field";
import { fmtDateLong, daysUntil } from "@/lib/format";

export function NextActionCard({
  appId,
  nextAction,
  nextActionDue,
}: {
  appId: string;
  nextAction: string | null;
  nextActionDue: Date | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const due = daysUntil(nextActionDue);
  const overdue = due !== null && due < 0;

  return (
    <div
      className={cn(
        "rounded-2xl border bg-card p-4",
        overdue ? "border-[#fb547340]" : "border-hairline",
      )}
    >
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
          <CalendarCheck className="size-4 text-accent-hi" />
          Next action
        </h2>
        {nextAction && (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                try {
                  await completeNextAction(appId);
                  toast.success("Next action completed");
                  router.refresh();
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Couldn't complete.");
                }
              })
            }
            className="inline-flex h-7 items-center gap-1 rounded-lg border border-hairline px-2 text-[11px] font-semibold text-ink-2 transition-colors hover:border-[#17c08a55] hover:text-[#17c08a] disabled:opacity-50"
          >
            <Check className="size-3.5" /> Done
          </button>
        )}
      </div>

      <div className="mt-1 grid grid-cols-[1fr_auto] items-end gap-3">
        <InlineField
          appId={appId}
          field="nextAction"
          label="What"
          value={nextAction ?? ""}
          placeholder="Set the next step…"
        />
        <InlineField
          appId={appId}
          field="nextActionDue"
          label="Due"
          type="date"
          value={nextActionDue ? nextActionDue.toISOString().slice(0, 10) : ""}
          display={
            nextActionDue ? (
              <span className={cn("tnum", overdue && "font-semibold text-[#fb5473]")}>
                {fmtDateLong(nextActionDue)}
                {overdue && ` · ${Math.abs(due!)}d overdue`}
              </span>
            ) : undefined
          }
        />
      </div>
    </div>
  );
}

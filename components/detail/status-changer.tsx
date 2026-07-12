"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { moveApplication } from "@/lib/actions";
import {
  BOARD_COLUMNS,
  CLOSED_STATUSES,
  STATUS_META,
  statusMeta,
} from "@/lib/constants";

const OPTIONS = [...BOARD_COLUMNS, ...CLOSED_STATUSES];

export function StatusChanger({ appId, status }: { appId: string; status: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const meta = statusMeta(status);

  return (
    <div className="relative inline-flex items-center">
      <span
        className="pointer-events-none absolute left-2.5 size-2 rounded-full"
        style={{ background: meta.color }}
      />
      <select
        value={status}
        disabled={pending}
        onChange={(e) => {
          const to = e.target.value;
          startTransition(async () => {
            try {
              await moveApplication(appId, to);
              toast.success(`Moved to ${statusMeta(to).label}`);
              router.refresh();
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Couldn't move.");
            }
          });
        }}
        className="h-9 appearance-none rounded-lg border border-hairline bg-white/[0.03] pl-7 pr-8 text-sm font-medium text-foreground outline-none transition-colors hover:border-white/15 focus-visible:border-ring disabled:opacity-50"
        style={{ color: meta.color }}
        aria-label="Change status"
      >
        {OPTIONS.map((s) => (
          <option key={s} value={s} style={{ color: "#edeef2" }}>
            {STATUS_META[s].label}
          </option>
        ))}
      </select>
      <svg
        className="pointer-events-none absolute right-2.5 size-3.5 text-ink-3"
        viewBox="0 0 16 16"
        fill="none"
      >
        <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </div>
  );
}

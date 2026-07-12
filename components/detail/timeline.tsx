"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { ActivityIcon } from "@/components/activity-icon";
import { addActivity } from "@/lib/actions";
import { fmtDateTime } from "@/lib/format";
import type { Activity } from "@/lib/db/schema";

const NOTE_TYPES = [
  { value: "note", label: "Note" },
  { value: "email_out", label: "Email sent" },
  { value: "email_in", label: "Email received" },
  { value: "interview", label: "Interview" },
  { value: "follow_up", label: "Follow-up" },
];

export function Timeline({
  appId,
  activities,
}: {
  appId: string;
  activities: Activity[];
}) {
  const router = useRouter();
  const [type, setType] = useState("note");
  const [title, setTitle] = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    if (!title.trim()) return;
    startTransition(async () => {
      try {
        await addActivity(appId, { type, title });
        setTitle("");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Couldn't log that.");
      }
    });
  }

  return (
    <div className="rounded-2xl border border-hairline bg-card">
      <div className="border-b border-hairline px-4 py-3">
        <h2 className="text-[13px] font-semibold text-foreground">Timeline</h2>
      </div>

      {/* add entry */}
      <div className="flex items-center gap-2 border-b border-hairline px-4 py-3">
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="h-8 shrink-0 appearance-none rounded-lg border border-input bg-white/[0.02] px-2 text-[12px] text-ink-2 outline-none hover:border-white/15 focus-visible:border-ring"
          aria-label="Entry type"
        >
          {NOTE_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Log what happened…"
          className="h-8 min-w-0 flex-1 rounded-lg border border-input bg-white/[0.02] px-2.5 text-[13px] text-foreground outline-none placeholder:text-ink-3 hover:border-white/15 focus-visible:border-ring"
        />
        <button
          type="button"
          onClick={submit}
          disabled={pending || !title.trim()}
          className="grid size-8 shrink-0 place-items-center rounded-lg border-0 bg-[linear-gradient(135deg,#7c6bf5,#4e7df0)] text-white transition-[filter] hover:brightness-110 disabled:opacity-40"
          aria-label="Add entry"
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
        </button>
      </div>

      {/* entries */}
      {activities.length === 0 ? (
        <p className="px-4 py-6 text-[12px] text-ink-3">
          Nothing logged yet — every email, call, and status change lands here.
        </p>
      ) : (
        <ul className="relative px-4 py-3">
          <span
            aria-hidden
            className="absolute bottom-5 left-[29.5px] top-5 w-px bg-hairline"
          />
          {activities.map((a) => (
            <li key={a.id} className="relative flex gap-3 py-2.5">
              <span className="relative z-10">
                <ActivityIcon type={a.type} size="sm" />
              </span>
              <div className="min-w-0 flex-1 pt-0.5">
                <p className="text-[13px] leading-snug text-foreground">{a.title}</p>
                {a.body && (
                  <p className="mt-0.5 text-[12px] leading-relaxed text-ink-2">{a.body}</p>
                )}
                <p className="tnum mt-0.5 text-[11px] text-ink-3">
                  {fmtDateTime(a.occurredAt)}
                  {a.source !== "manual" && <span> · {a.source}</span>}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { patchApplication } from "@/lib/actions";

type Option = { value: string; label: string };

/**
 * Click-to-edit fact row. Text/number/date inputs or a select when `options`
 * is given. Enter/✓ saves via patchApplication; Esc/✗ cancels.
 */
export function InlineField({
  appId,
  field,
  label,
  value,
  display,
  type = "text",
  options,
  placeholder = "—",
}: {
  appId: string;
  field: string;
  label: string;
  /** raw editable value (string form) */
  value: string;
  /** pretty rendering when not editing (defaults to value) */
  display?: React.ReactNode;
  type?: "text" | "number" | "date";
  options?: Option[];
  placeholder?: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function begin() {
    setDraft(value);
    setEditing(true);
  }

  function save(next: string = draft) {
    setEditing(false);
    if (next === value) return;
    startTransition(async () => {
      try {
        await patchApplication(appId, {
          [field]: type === "number" && next !== "" ? Number(next) : next,
        });
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Couldn't save.");
      }
    });
  }

  return (
    <div className="group flex min-h-9 flex-col gap-0.5 py-1">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">
        {label}
      </span>

      {!editing ? (
        <button
          type="button"
          onClick={begin}
          className={cn(
            "-mx-1.5 flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-left text-sm transition-colors hover:bg-white/[0.04]",
            pending && "opacity-50",
          )}
        >
          <span className={cn("min-w-0 flex-1 truncate", !value && "text-ink-3")}>
            {display ?? (value || placeholder)}
          </span>
          <Pencil className="size-3 shrink-0 text-ink-3 opacity-0 transition-opacity group-hover:opacity-100" />
        </button>
      ) : options ? (
        <select
          autoFocus
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            save(e.target.value);
          }}
          onBlur={() => setEditing(false)}
          className="h-8 w-full appearance-none rounded-md border border-ring bg-elevated px-2 text-sm text-foreground outline-none"
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : (
        <div className="flex items-center gap-1">
          <input
            ref={inputRef}
            autoFocus
            type={type}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
              if (e.key === "Escape") setEditing(false);
            }}
            className="h-8 w-full rounded-md border border-ring bg-elevated px-2 text-sm text-foreground outline-none"
          />
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => save()}
            className="grid size-7 shrink-0 place-items-center rounded-md text-[#17c08a] hover:bg-white/[0.06]"
            aria-label="Save"
          >
            <Check className="size-4" />
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setEditing(false)}
            className="grid size-7 shrink-0 place-items-center rounded-md text-ink-3 hover:bg-white/[0.06]"
            aria-label="Cancel"
          >
            <X className="size-4" />
          </button>
        </div>
      )}
    </div>
  );
}

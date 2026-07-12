import type { ComponentType, ReactNode } from "react";
import type { LucideProps } from "lucide-react";
import { cn } from "@/lib/utils";

export function StatTile({
  label,
  value,
  sub,
  icon: Icon,
  accent = false,
  tone,
  className,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  icon?: ComponentType<LucideProps>;
  accent?: boolean;
  /** Optional semantic color for the value (e.g. status color). */
  tone?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-hairline bg-card p-4",
        accent && "shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)]",
        className,
      )}
    >
      {accent && (
        <div
          aria-hidden
          className="pointer-events-none absolute -right-8 -top-10 size-28 rounded-full opacity-60 blur-2xl"
          style={{ background: "radial-gradient(circle, rgba(124,107,245,0.35), transparent 70%)" }}
        />
      )}
      <div className="flex items-start justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">
          {label}
        </span>
        {Icon && (
          <span className="grid size-7 place-items-center rounded-lg border border-hairline bg-white/[0.02] text-ink-2">
            <Icon className="size-3.5" />
          </span>
        )}
      </div>
      <div
        className="tnum mt-3 text-[28px] font-semibold leading-none tracking-tight"
        style={tone ? { color: tone } : undefined}
      >
        {value}
      </div>
      {sub && <div className="mt-1.5 text-[12px] text-ink-2">{sub}</div>}
    </div>
  );
}

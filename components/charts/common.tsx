"use client";

/** Shared Recharts styling per /dataviz: recessive grid/axes, dark tooltip. */

export const AXIS_TICK = { fill: "#666b7d", fontSize: 11 } as const;
export const GRID_STROKE = "rgba(255,255,255,0.05)";
export const ACCENT = "#7c6bf5";
/** Chart surface (card) — used for the 2px gap ring between adjacent fills. */
export const SURFACE = "#14151c";

export function ChartTooltip({
  active,
  label,
  rows,
}: {
  active?: boolean;
  label?: string;
  rows: { name: string; value: string; color?: string }[];
}) {
  if (!active || rows.length === 0) return null;
  return (
    <div className="rounded-lg border border-hairline bg-elevated px-3 py-2 shadow-[0_8px_24px_-8px_rgba(0,0,0,0.7)]">
      {label && (
        <p className="mb-1 text-[11px] font-semibold text-foreground">{label}</p>
      )}
      {rows.map((r) => (
        <p key={r.name} className="flex items-center gap-1.5 text-[11.5px] text-ink-2">
          {r.color && (
            <span className="size-2 rounded-full" style={{ background: r.color }} />
          )}
          <span>{r.name}</span>
          <span className="tnum ml-auto pl-3 font-medium text-foreground">{r.value}</span>
        </p>
      ))}
    </div>
  );
}

"use client";

import { ACCENT } from "./common";

interface Row {
  stage: string;
  count: number;
  pctOfApplied: number;
}

/**
 * Funnel conversion — plain-HTML horizontal reach bars (single hue = one
 * measure; identity via the stage label). Direct labels: count + % of applied.
 */
export function FunnelChart({ data }: { data: Row[] }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <div className="space-y-1.5 py-1">
      {data.map((d) => (
        <div
          key={d.stage}
          className="group relative grid grid-cols-[78px_1fr_76px] items-center gap-3 rounded-lg px-1 py-1.5 transition-colors hover:bg-white/[0.03]"
        >
          <span className="text-[11px] text-ink-3">{d.stage}</span>
          <div className="h-[18px] overflow-hidden rounded-[4px] bg-white/[0.03]">
            <div
              className="h-full rounded-[4px]"
              style={{
                width: `${(d.count / max) * 100}%`,
                background: ACCENT,
                minWidth: d.count > 0 ? 4 : 0,
              }}
            />
          </div>
          <span className="tnum text-[11px] text-ink-2">
            {d.count} · {d.pctOfApplied}%
          </span>

          {/* hover tooltip */}
          <div className="pointer-events-none absolute -top-9 left-24 z-10 hidden rounded-lg border border-hairline bg-elevated px-2.5 py-1.5 shadow-[0_8px_24px_-8px_rgba(0,0,0,0.7)] group-hover:block">
            <p className="whitespace-nowrap text-[11px] text-ink-2">
              <span className="font-semibold text-foreground">{d.stage}</span>
              {" · "}reached <span className="tnum font-medium text-foreground">{d.count}</span>
              {" · "}
              <span className="tnum">{d.pctOfApplied}%</span> of applied
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

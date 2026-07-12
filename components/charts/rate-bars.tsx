"use client";

import { ACCENT } from "./common";

export interface RateRow {
  label: string;
  /** 0–100, or null when the group has no denominator */
  rate: number | null;
  /** how many were sent (denominator) — always shown: 0% on n=1 is a whisper, not a verdict */
  sent: number;
}

/**
 * Horizontal % bars — plain HTML (labels always render, including 0% rows).
 * One measure → one hue; identity via the row label; per-mark hover tooltip.
 */
export function RateBars({
  data,
  rateName = "Response rate",
}: {
  data: RateRow[];
  rateName?: string;
}) {
  return (
    <div className="space-y-1">
      {data.map((d) => (
        <div
          key={d.label}
          className="group relative grid grid-cols-[104px_1fr_84px] items-center gap-3 rounded-lg px-1 py-1.5 transition-colors hover:bg-white/[0.03]"
        >
          <span className="truncate text-[11px] text-ink-3">{d.label}</span>
          <div className="h-4 overflow-hidden rounded-[4px] bg-white/[0.03]">
            <div
              className="h-full rounded-[4px] transition-[width]"
              style={{
                width: `${d.rate ?? 0}%`,
                background: ACCENT,
                minWidth: d.rate != null && d.rate > 0 ? 4 : 0,
              }}
            />
          </div>
          <span className="tnum text-[11px] text-ink-2">
            {d.rate == null ? "n/a" : `${d.rate}%`} · n={d.sent}
          </span>

          {/* hover tooltip */}
          <div className="pointer-events-none absolute -top-9 left-28 z-10 hidden rounded-lg border border-hairline bg-elevated px-2.5 py-1.5 shadow-[0_8px_24px_-8px_rgba(0,0,0,0.7)] group-hover:block">
            <p className="whitespace-nowrap text-[11px] text-ink-2">
              <span className="font-semibold text-foreground">{d.label}</span>
              {" · "}
              {rateName}:{" "}
              <span className="tnum font-medium text-foreground">
                {d.rate == null ? "n/a" : `${d.rate}%`}
              </span>
              {" · "}sent <span className="tnum">{d.sent}</span>
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

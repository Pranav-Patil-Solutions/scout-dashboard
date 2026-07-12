"use client";

import {
  CartesianGrid,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  Cell,
} from "recharts";
import { AXIS_TICK, ChartTooltip, GRID_STROKE, SURFACE } from "./common";
import type { Outcome } from "@/lib/analytics";

interface Point {
  outcome: Outcome;
  fit: number;
  company: string;
  role: string;
}

/**
 * Fit-score vs outcome (§7): does higher fit actually convert?
 * Dot strip per outcome group. Outcome colors are the reserved status set —
 * identity is carried by the x-axis group label, never color alone.
 * Markers ≥8px with a 2px surface ring (overlap rule).
 */
const GROUPS: { key: Outcome; label: string; color: string }[] = [
  { key: "rejected", label: "Rejected", color: "#fb5473" },
  { key: "no_response", label: "No response", color: "#8a8fa3" },
  { key: "responded", label: "Responded", color: "#5b8def" },
  { key: "interview", label: "Interview+", color: "#17c08a" },
];

export function FitOutcomeChart({ data }: { data: Point[] }) {
  // deterministic jitter (index-based) so SSR/client match
  const points = data.map((p, i) => {
    const gi = GROUPS.findIndex((g) => g.key === p.outcome);
    return { ...p, x: gi + ((i % 5) - 2) * 0.07, gi };
  });

  return (
    <div className="h-[240px]">
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ left: -18, right: 12, top: 8, bottom: 0 }}>
          <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 4" vertical={false} />
          <XAxis
            type="number"
            dataKey="x"
            domain={[-0.5, GROUPS.length - 0.5]}
            ticks={[0, 1, 2, 3]}
            tickFormatter={(v: number) => GROUPS[Math.round(v)]?.label ?? ""}
            tickLine={false}
            axisLine={false}
            tick={AXIS_TICK}
          />
          <YAxis
            type="number"
            dataKey="fit"
            domain={[0, 100]}
            tickLine={false}
            axisLine={false}
            tick={AXIS_TICK}
            label={{
              value: "Fit score",
              angle: -90,
              position: "insideLeft",
              offset: 28,
              fill: "#666b7d",
              fontSize: 11,
            }}
          />
          <Tooltip
            cursor={false}
            content={({ active, payload }) => {
              const d = payload?.[0]?.payload as (Point & { gi: number }) | undefined;
              return (
                <ChartTooltip
                  active={active}
                  label={d?.company}
                  rows={
                    d
                      ? [
                          { name: "Fit", value: String(d.fit), color: GROUPS[d.gi].color },
                          { name: "Outcome", value: GROUPS[d.gi].label },
                        ]
                      : []
                  }
                />
              );
            }}
          />
          <Scatter data={points} isAnimationActive={false} shape={(props: unknown) => {
            const { cx, cy, payload } = props as { cx: number; cy: number; payload: Point & { gi: number } };
            return (
              <circle
                cx={cx}
                cy={cy}
                r={5}
                fill={GROUPS[payload.gi].color}
                stroke={SURFACE}
                strokeWidth={2}
              />
            );
          }}>
            {points.map((p, i) => (
              <Cell key={i} />
            ))}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}

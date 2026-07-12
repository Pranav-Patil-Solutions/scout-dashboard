"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ACCENT, AXIS_TICK, ChartTooltip, GRID_STROKE } from "./common";

interface Row {
  week: string;
  count: number;
  isCurrent: boolean;
}

/**
 * Weekly velocity vs the goal line (§7). One measure, one hue; the current
 * (incomplete) week renders muted; the goal is a labeled dashed line.
 */
export function VelocityChart({ data, goal }: { data: Row[]; goal: number }) {
  const yMax = Math.max(goal + 1, ...data.map((d) => d.count));
  return (
    <div className="h-[200px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ left: -22, right: 8, top: 12, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={GRID_STROKE} strokeDasharray="3 4" />
          <XAxis dataKey="week" tickLine={false} axisLine={false} tick={AXIS_TICK} />
          <YAxis
            domain={[0, yMax]}
            allowDecimals={false}
            tickLine={false}
            axisLine={false}
            tick={AXIS_TICK}
          />
          <Tooltip
            cursor={{ fill: "rgba(255,255,255,0.03)" }}
            content={({ active, payload }) => {
              const d = payload?.[0]?.payload as Row | undefined;
              return (
                <ChartTooltip
                  active={active}
                  label={d ? `${d.week}${d.isCurrent ? " (current)" : ""}` : undefined}
                  rows={
                    d
                      ? [
                          { name: "Applications", value: String(d.count), color: ACCENT },
                          { name: "Goal", value: String(goal) },
                        ]
                      : []
                  }
                />
              );
            }}
          />
          <ReferenceLine
            y={goal}
            stroke="#a2a6b4"
            strokeDasharray="5 4"
            label={{
              value: `Goal ${goal}/wk`,
              position: "insideTopRight",
              fill: "#a2a6b4",
              fontSize: 11,
            }}
          />
          <Bar dataKey="count" barSize={22} radius={[4, 4, 0, 0]} isAnimationActive={false}>
            {data.map((d) => (
              <Cell key={d.week} fill={ACCENT} opacity={d.isCurrent ? 0.45 : 1} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

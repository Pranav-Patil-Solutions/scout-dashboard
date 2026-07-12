"use client";

import { useState, type ReactNode } from "react";
import { Table2, ChartColumn } from "lucide-react";
import { cn } from "@/lib/utils";

export interface TableSpec {
  headers: string[];
  rows: (string | number)[][];
}

/**
 * Chart container: title, plain-language meaning line, and a chart⇄table
 * toggle (the /dataviz "a table view exists" rule).
 */
export function ChartCard({
  title,
  meaning,
  table,
  children,
  className,
}: {
  title: string;
  /** one plain sentence: what this chart answers */
  meaning: string;
  table?: TableSpec;
  children: ReactNode;
  className?: string;
}) {
  const [showTable, setShowTable] = useState(false);

  return (
    <section className={cn("rounded-2xl border border-hairline bg-card", className)}>
      <div className="flex items-start justify-between gap-3 border-b border-hairline px-4 py-3">
        <div>
          <h2 className="text-[13px] font-semibold text-foreground">{title}</h2>
          <p className="mt-0.5 text-[11.5px] leading-snug text-ink-3">{meaning}</p>
        </div>
        {table && (
          <button
            type="button"
            onClick={() => setShowTable((v) => !v)}
            className="grid size-7 shrink-0 place-items-center rounded-lg border border-hairline text-ink-3 transition-colors hover:border-white/15 hover:text-foreground"
            aria-label={showTable ? "Show chart" : "Show data table"}
            title={showTable ? "Show chart" : "Show data table"}
          >
            {showTable ? <ChartColumn className="size-3.5" /> : <Table2 className="size-3.5" />}
          </button>
        )}
      </div>

      <div className="p-4">
        {showTable && table ? (
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="border-b border-hairline text-left text-[10.5px] uppercase tracking-wide text-ink-3">
                  {table.headers.map((h) => (
                    <th key={h} className="px-2 py-1.5 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row, i) => (
                  <tr key={i} className="border-b border-hairline/50 last:border-0">
                    {row.map((cell, j) => (
                      <td
                        key={j}
                        className={cn("px-2 py-1.5", j > 0 ? "tnum text-ink-2" : "text-foreground")}
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          children
        )}
      </div>
    </section>
  );
}

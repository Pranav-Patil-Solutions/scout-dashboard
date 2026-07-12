import { sourceLabel } from "@/lib/constants";

interface Row {
  source: string;
  sent: number;
  responseRate: number;
  interviewRate: number;
}

/** Source performance (§7): table + inline bars, both rates visible. */
export function SourceTable({ data }: { data: Row[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-[12.5px]">
        <thead>
          <tr className="border-b border-hairline text-left text-[10.5px] uppercase tracking-wide text-ink-3">
            <th className="py-2 pr-3 font-medium">Source</th>
            <th className="tnum py-2 pr-3 font-medium">Sent</th>
            <th className="py-2 pr-3 font-medium">Response rate</th>
            <th className="py-2 font-medium">Interview rate</th>
          </tr>
        </thead>
        <tbody>
          {data.map((r) => (
            <tr key={r.source} className="border-b border-hairline/50 last:border-0">
              <td className="py-2.5 pr-3 font-medium text-foreground">
                {sourceLabel(r.source)}
              </td>
              <td className="tnum py-2.5 pr-3 text-ink-2">{r.sent}</td>
              <td className="py-2.5 pr-3">
                <RateCell value={r.responseRate} color="#7c6bf5" />
              </td>
              <td className="py-2.5">
                <RateCell value={r.interviewRate} color="#0fa39a" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RateCell({ value, color }: { value: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-24 overflow-hidden rounded-full bg-white/[0.04]">
        <div
          className="h-full rounded-full"
          style={{ width: `${value}%`, background: color }}
        />
      </div>
      <span className="tnum w-9 text-ink-2">{value}%</span>
    </div>
  );
}

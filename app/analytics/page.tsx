import Link from "next/link";
import {
  Hourglass,
  MessageSquareReply,
  Send,
  Target,
  TriangleAlert,
} from "lucide-react";
import { computeAnalytics } from "@/lib/analytics";
import { StatTile } from "@/components/stat-tile";
import { ChartCard } from "@/components/charts/chart-card";
import { FunnelChart } from "@/components/charts/funnel-chart";
import { VelocityChart } from "@/components/charts/velocity-chart";
import { FitOutcomeChart } from "@/components/charts/fit-outcome-chart";
import { RateBars } from "@/components/charts/rate-bars";
import { SourceTable } from "@/components/charts/source-table";
import { sourceLabel } from "@/lib/constants";
import { FitChip } from "@/components/chips";

const OUTCOME_LABEL: Record<string, string> = {
  rejected: "Rejected",
  no_response: "No response",
  responded: "Responded",
  interview: "Interview+",
};

export default async function AnalyticsPage() {
  const a = await computeAnalytics();
  const days = (v: number | null) => (v == null ? "—" : `${v}d`);

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-6 md:px-6 md:py-8">
      <header className="mb-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-3">
          Insights
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
          What actually converts
        </h1>
      </header>

      {/* MISSED — the Moss lesson, headlined as a warning (§7) */}
      {a.missed.count > 0 && (
        <section className="mb-6 overflow-hidden rounded-2xl border border-[#ff5a5245] bg-card">
          <div className="flex items-center gap-3 px-4 py-3.5">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#ff5a5220]">
              <TriangleAlert className="size-5" style={{ color: "#ff5a52" }} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-semibold text-foreground">
                <span className="tnum" style={{ color: "#ff5a52" }}>
                  {a.missed.count} {a.missed.count === 1 ? "role" : "roles"}
                </span>{" "}
                closed before you applied
              </p>
              <p className="text-[12px] text-ink-2">
                Never again — that&apos;s what the Action Queue is for.
              </p>
            </div>
          </div>
          <ul className="border-t border-hairline/60">
            {a.missed.apps.map((m) => (
              <li
                key={m.id}
                className="flex items-center gap-3 border-b border-hairline/40 px-4 py-2.5 last:border-0"
              >
                <Link
                  href={`/a/${m.id}`}
                  className="text-[13px] font-medium text-foreground hover:text-accent-hi"
                >
                  {m.company}
                </Link>
                <span className="truncate text-[12px] text-ink-3">{m.role}</span>
                <span className="ml-auto flex shrink-0 items-center gap-2">
                  {m.kitWasReady && (
                    <span className="rounded-md bg-[#ff5a5220] px-1.5 py-0.5 text-[10px] font-bold text-[#ff5a52]">
                      KIT WAS READY
                    </span>
                  )}
                  <FitChip score={m.fit} />
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* KPI row — §7 headline rates, labeled plainly */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Response rate"
          value={a.kpi.responseRate == null ? "—" : `${a.kpi.responseRate}%`}
          sub={`${a.kpi.responded} of ${a.kpi.applied} applied got a human reply`}
          icon={MessageSquareReply}
          accent
        />
        <StatTile
          label="Interview rate"
          value={a.kpi.interviewRate == null ? "—" : `${a.kpi.interviewRate}%`}
          sub={`${a.kpi.interviews} reached interview`}
          icon={Target}
        />
        <StatTile
          label="Median time to response"
          value={days(a.kpi.medianTimeToResponse)}
          sub="Applied → first human reply"
          icon={Send}
        />
        <StatTile
          label="Median time to rejection"
          value={days(a.kpi.medianTimeToRejection)}
          sub={`Across ${a.kpi.rejections} rejections`}
          icon={Hourglass}
          tone={
            a.kpi.medianTimeToRejection != null && a.kpi.medianTimeToRejection <= 2
              ? "#fb5473"
              : undefined
          }
        />
      </section>

      {/* Charts */}
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Funnel conversion"
          meaning="How far applications get: applied → screening → interview → offer."
          table={{
            headers: ["Stage", "Reached", "% of applied"],
            rows: a.funnel.map((f) => [f.stage, f.count, `${f.pctOfApplied}%`]),
          }}
        >
          <FunnelChart data={a.funnel} />
        </ChartCard>

        <ChartCard
          title="Weekly velocity"
          meaning={`Applications sent per ISO week vs your goal of ${a.weeklyGoal}.`}
          table={{
            headers: ["Week", "Sent"],
            rows: a.velocity.map((v) => [v.week + (v.isCurrent ? " (current)" : ""), v.count]),
          }}
        >
          <VelocityChart data={a.velocity} goal={a.weeklyGoal} />
        </ChartCard>

        <ChartCard
          title="Fit score vs outcome"
          meaning="Does higher fit actually convert for you? Each dot is one application."
          table={{
            headers: ["Company", "Fit", "Outcome"],
            rows: a.fitOutcome.map((p) => [p.company, p.fit, OUTCOME_LABEL[p.outcome]]),
          }}
        >
          <FitOutcomeChart data={a.fitOutcome} />
        </ChartCard>

        <ChartCard
          title="Role-type outcomes"
          meaning="Response rate by role bucket — where the fast rejections cluster."
          table={{
            headers: ["Role type", "Sent", "Response rate", "Rejections"],
            rows: a.roles.map((r) => [r.bucket, r.sent, `${r.responseRate}%`, r.rejections]),
          }}
        >
          <RateBars
            data={a.roles.map((r) => ({ label: r.bucket, rate: r.responseRate, sent: r.sent }))}
          />
        </ChartCard>

        <ChartCard
          title="Source performance"
          meaning="Which channels actually reply — sent, response rate, interview rate."
          className="lg:col-span-2"
          table={{
            headers: ["Source", "Sent", "Response rate", "Interview rate"],
            rows: a.sources.map((s) => [
              sourceLabel(s.source),
              s.sent,
              `${s.responseRate}%`,
              `${s.interviewRate}%`,
            ]),
          }}
        >
          <SourceTable data={a.sources} />
        </ChartCard>

        <ChartCard
          title="Language outcomes"
          meaning="English-first vs German-required roles: volume sent and who replies."
          className="lg:col-span-2"
          table={{
            headers: ["Group", "Sent", "Response rate"],
            rows: a.language.map((l) => [
              l.group,
              l.sent,
              l.responseRate == null ? "n/a" : `${l.responseRate}%`,
            ]),
          }}
        >
          <RateBars
            data={a.language.map((l) => ({ label: l.group, rate: l.responseRate, sent: l.sent }))}
          />
        </ChartCard>
      </div>
    </div>
  );
}

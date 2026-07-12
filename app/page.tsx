import Link from "next/link";
import { isSameWeek } from "date-fns";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  MessageSquareReply,
  Target,
  Zap,
} from "lucide-react";
import { getAllApplications, getRecentActivities, getSyncStatus } from "@/lib/queries";
import { buildActionQueue } from "@/lib/action-queue";
import { ACTIVE_STATUSES, WEEKLY_GOAL, type Status } from "@/lib/constants";
import { StatTile } from "@/components/stat-tile";
import { ActionQueue } from "@/components/action-queue";
import { ActivityIcon } from "@/components/activity-icon";
import { SyncButton } from "@/components/proposal-review";
import { fmtRelative } from "@/lib/format";

export default function CommandPage() {
  const apps = getAllApplications();
  const queue = buildActionQueue(apps);
  const recent = getRecentActivities(8);
  const sync = getSyncStatus();
  const now = new Date();

  const applied = apps.filter((a) => a.appliedAt);
  const responded = applied.filter((a) => a.firstResponseAt);
  const interviews = apps.filter((a) => a.status === "interview" || a.status === "offer");
  const active = apps.filter((a) => ACTIVE_STATUSES.includes(a.status as Status));
  const thisWeek = applied.filter(
    (a) => a.appliedAt && isSameWeek(a.appliedAt, now, { weekStartsOn: 1 }),
  );

  const responseRate = applied.length
    ? Math.round((responded.length / applied.length) * 100)
    : 0;
  const interviewRate = applied.length
    ? Math.round((interviews.length / applied.length) * 100)
    : 0;

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-6 md:px-6 md:py-8">
      <header className="mb-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-3">
          Command
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
          Your job search at a glance
        </h1>
      </header>

      {/* Stat tiles */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Active apps"
          value={active.length}
          sub="In the live pipeline"
          icon={Activity}
          accent
        />
        <StatTile
          label="Response rate"
          value={`${responseRate}%`}
          sub={`${responded.length} of ${applied.length} applied`}
          icon={MessageSquareReply}
          tone={responseRate >= 30 ? "#17c08a" : "#a2a6b4"}
        />
        <StatTile
          label="Interviews"
          value={interviews.length}
          sub={`${interviewRate}% interview rate`}
          icon={Target}
          tone={interviews.length > 0 ? "#17c08a" : "#a2a6b4"}
        />
        <StatTile
          label="This week"
          value={thisWeek.length}
          sub={`Goal ${WEEKLY_GOAL}/week`}
          tone={
            thisWeek.length >= WEEKLY_GOAL
              ? "#17c08a"
              : thisWeek.length === 0
                ? "#fb5473"
                : "#fbb03b"
          }
        />
      </section>

      {/* Action Queue — the hero */}
      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Zap className="size-4 text-accent-hi" />
            Action Queue
            {queue.length > 0 && (
              <span className="tnum rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-accent-hi">
                {queue.length}
              </span>
            )}
          </h2>
          <Link
            href="/pipeline"
            className="inline-flex items-center gap-1 text-xs font-medium text-ink-2 transition-colors hover:text-foreground"
          >
            Open board <ArrowRight className="size-3.5" />
          </Link>
        </div>
        <ActionQueue items={queue} />

        {/* Email-sync status strip (JOBDASH-002 P4) */}
        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-hairline bg-card px-4 py-3">
          <span
            className={`size-1.5 shrink-0 rounded-full ${sync.pending > 0 ? "bg-[#fbb03b] shadow-[0_0_8px_1px_#fbb03b66]" : "bg-[#17c08a] shadow-[0_0_8px_1px_#17c08a66]"}`}
          />
          <p className="min-w-0 flex-1 truncate text-[12px] text-ink-2">
            <span className="font-semibold text-foreground">Email sync</span>
            <span className="tnum">
              {" "}
              — {sync.lastRunAt ? `last run ${fmtRelative(sync.lastRunAt)}` : "never run"}
            </span>
            {sync.pending > 0 && (
              <Link href="/inbox-sync" className="font-semibold text-accent-hi hover:underline">
                {" "}
                · {sync.pending} proposal{sync.pending === 1 ? "" : "s"} to review
              </Link>
            )}
          </p>
          <SyncButton compact />
        </div>
      </section>

      {/* Recent activity strip */}
      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold text-foreground">Recent activity</h2>
        <div className="overflow-hidden rounded-2xl border border-hairline bg-card">
          {recent.length === 0 ? (
            <p className="px-5 py-6 text-[12px] text-ink-3">
              No activity yet — everything you log lands here.
            </p>
          ) : (
            <ul>
              {recent.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center gap-3 border-b border-hairline/60 px-4 py-2.5 last:border-0"
                >
                  <ActivityIcon type={r.type} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] text-foreground">
                      <Link
                        href={`/a/${r.applicationId}`}
                        className="font-semibold hover:text-accent-hi"
                      >
                        {r.company}
                      </Link>
                      <span className="text-ink-2"> — {r.title}</span>
                    </p>
                  </div>
                  <span className="tnum shrink-0 text-[11px] text-ink-3">
                    {fmtRelative(r.occurredAt)}
                  </span>
                  <Link
                    href={`/a/${r.applicationId}`}
                    aria-label={`Open ${r.company}`}
                    className="grid size-6 shrink-0 place-items-center rounded-md text-ink-3 hover:bg-white/[0.05] hover:text-foreground"
                  >
                    <ArrowUpRight className="size-3.5" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

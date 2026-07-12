import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, FileBadge, FileText } from "lucide-react";
import { getActivitiesForApplication, getApplicationById } from "@/lib/queries";
import { FitChip, GermanReqDot, SourceTag } from "@/components/chips";
import { StatusChanger } from "@/components/detail/status-changer";
import { InlineField } from "@/components/detail/inline-field";
import { Timeline } from "@/components/detail/timeline";
import { NextActionCard } from "@/components/detail/next-action-card";
import { EditButton } from "@/components/detail/edit-button";
import {
  GERMAN_REQ_META,
  SENIORITY,
  SOURCES,
  WORK_MODES,
  type GermanReq,
} from "@/lib/constants";
import { fmtDateLong } from "@/lib/format";

export default async function ApplicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const app = await getApplicationById(id);
  if (!app) notFound();
  const activities = await getActivitiesForApplication(id);

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-6 md:px-6 md:py-8">
      <Link
        href="/pipeline"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-2 transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" /> Back to board
      </Link>

      {/* Header */}
      <header className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              {app.company}
            </h1>
            <FitChip score={app.fitScore} band={app.fitBand} showLabel />
            {app.isKitReady && (
              <span className="rounded-md bg-primary/15 px-1.5 py-0.5 text-[10px] font-bold text-accent-hi">
                KIT READY
              </span>
            )}
          </div>
          <p className="mt-1 text-[15px] text-ink-2">{app.roleTitle}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <SourceTag source={app.source} />
            <GermanReqDot req={app.germanReq} withLabel />
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <StatusChanger appId={app.id} status={app.status} />
          {app.applyUrl && (
            <a
              href={app.applyUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-hairline px-3 text-sm font-medium text-ink-2 transition-colors hover:border-white/15 hover:text-foreground"
            >
              <ExternalLink className="size-3.5" /> Apply
            </a>
          )}
          {app.jdUrl && (
            <a
              href={app.jdUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-hairline px-3 text-sm font-medium text-ink-2 transition-colors hover:border-white/15 hover:text-foreground"
            >
              <FileText className="size-3.5" /> JD
            </a>
          )}
          <EditButton appId={app.id} />
        </div>
      </header>

      {/* Body: facts left, timeline right */}
      <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,4fr)]">
        <div className="space-y-4">
          {/* Facts — inline-editable */}
          <section className="rounded-2xl border border-hairline bg-card px-4 py-3">
            <h2 className="pb-1 pt-1 text-[13px] font-semibold text-foreground">Facts</h2>
            <div className="grid grid-cols-2 gap-x-6">
              <InlineField
                appId={app.id}
                field="fitScore"
                label="Fit score"
                type="number"
                value={app.fitScore == null ? "" : String(app.fitScore)}
                display={<FitChip score={app.fitScore} band={app.fitBand} showLabel />}
              />
              <InlineField
                appId={app.id}
                field="source"
                label="Source"
                value={app.source}
                options={SOURCES.map((s) => ({ value: s.key, label: s.label }))}
                display={<SourceTag source={app.source} />}
              />
              <InlineField
                appId={app.id}
                field="germanReq"
                label="German requirement"
                value={app.germanReq}
                options={(Object.keys(GERMAN_REQ_META) as GermanReq[]).map((k) => ({
                  value: k,
                  label: GERMAN_REQ_META[k].label,
                }))}
                display={<GermanReqDot req={app.germanReq} withLabel />}
              />
              <InlineField
                appId={app.id}
                field="location"
                label="Location"
                value={app.location ?? ""}
              />
              <InlineField
                appId={app.id}
                field="workMode"
                label="Work mode"
                value={app.workMode ?? ""}
                options={[
                  { value: "", label: "—" },
                  ...WORK_MODES.map((m) => ({
                    value: m,
                    label: m[0].toUpperCase() + m.slice(1),
                  })),
                ]}
              />
              <InlineField
                appId={app.id}
                field="seniority"
                label="Seniority"
                value={app.seniority ?? ""}
                options={[
                  { value: "", label: "—" },
                  ...SENIORITY.map((s) => ({
                    value: s,
                    label: s[0].toUpperCase() + s.slice(1),
                  })),
                ]}
              />
              <InlineField
                appId={app.id}
                field="salaryRange"
                label="Salary range"
                value={app.salaryRange ?? ""}
              />
              <div className="flex min-h-9 flex-col gap-0.5 py-1">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">
                  Applied
                </span>
                <span className="tnum text-sm text-foreground">
                  {fmtDateLong(app.appliedAt)}
                </span>
              </div>
              <div className="flex min-h-9 flex-col gap-0.5 py-1">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">
                  First response
                </span>
                <span className="tnum text-sm text-foreground">
                  {fmtDateLong(app.firstResponseAt)}
                </span>
              </div>
              {app.closedAt && (
                <div className="flex min-h-9 flex-col gap-0.5 py-1">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">
                    Closed
                  </span>
                  <span className="tnum text-sm text-foreground">
                    {fmtDateLong(app.closedAt)}
                    {app.closedReason && (
                      <span className="text-ink-3"> · {app.closedReason.replace("_", " ")}</span>
                    )}
                  </span>
                </div>
              )}
              <InlineField
                appId={app.id}
                field="applyUrl"
                label="Apply URL"
                value={app.applyUrl ?? ""}
              />
              <InlineField
                appId={app.id}
                field="jdUrl"
                label="JD URL"
                value={app.jdUrl ?? ""}
              />
            </div>
          </section>

          {/* Documents */}
          <section className="rounded-2xl border border-hairline bg-card px-4 py-3">
            <h2 className="flex items-center gap-2 pb-1 pt-1 text-[13px] font-semibold text-foreground">
              <FileBadge className="size-4 text-accent-hi" /> Documents
            </h2>
            <div className="grid grid-cols-2 gap-x-6">
              <InlineField
                appId={app.id}
                field="resumeVariant"
                label="Resume variant"
                value={app.resumeVariant ?? ""}
                placeholder="e.g. AI-forward"
              />
              <InlineField
                appId={app.id}
                field="coverPath"
                label="Cover used"
                value={app.coverPath ?? ""}
                placeholder="covers/…"
              />
            </div>
          </section>

          {/* Next action */}
          <NextActionCard
            appId={app.id}
            nextAction={app.nextAction}
            nextActionDue={app.nextActionDue}
          />

          {/* Notes */}
          <section className="rounded-2xl border border-hairline bg-card px-4 py-3">
            <h2 className="pb-1 pt-1 text-[13px] font-semibold text-foreground">Notes</h2>
            <InlineField
              appId={app.id}
              field="notes"
              label=""
              value={app.notes ?? ""}
              placeholder="Add context…"
            />
          </section>
        </div>

        {/* Timeline */}
        <Timeline appId={app.id} activities={activities} />
      </div>
    </div>
  );
}

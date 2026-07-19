import { count, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { scoutJobs } from "@/lib/db/schema";
import { getAllApplications, getScoutJobs } from "@/lib/queries";
import { analyzeRejections, highRejectRoleBuckets } from "@/lib/analysis/rejections";
import { buildAffinityProfile } from "@/lib/reco/profile";
import { scoreScoutJob, type Recommendation } from "@/lib/reco/score";
import { JobBoard } from "@/components/job-board";
import { ScoutSweep } from "@/components/scout-sweep";

type Tab = "new" | "dismissed" | "promoted";

/** Ranking kicks in once the pipeline is big enough to mean something. */
const MIN_PROFILE_SAMPLE = 3;

export default async function DiscoverPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab: rawTab } = await searchParams;
  const tab: Tab = rawTab === "dismissed" || rawTab === "promoted" ? rawTab : "new";

  const [jobs, counts, expiredCount] = await Promise.all([
    getScoutJobs(tab),
    (async () =>
      Object.fromEntries(
        await Promise.all(
          (["new", "dismissed", "promoted"] as Tab[]).map(async (s): Promise<[Tab, number]> => [
            s,
            (await db.select({ n: count() }).from(scoutJobs).where(eq(scoutJobs.status, s)).get())?.n ?? 0,
          ]),
        ),
      ) as Record<Tab, number>)(),
    (async () =>
      (await db.select({ n: count() }).from(scoutJobs).where(eq(scoutJobs.status, "expired")).get())
        ?.n ?? 0)(),
  ]);

  // JOBDASH-006 §5 — "More like your pipeline": rank Open roles by similarity
  // to the active pipeline; §4's high-reject buckets sink to the bottom.
  let reco: Record<string, Recommendation> | undefined;
  if (tab === "new" && jobs.length > 0) {
    const apps = await getAllApplications();
    const profile = buildAffinityProfile(apps);
    if (profile.sampleSize >= MIN_PROFILE_SAMPLE) {
      const excluded = highRejectRoleBuckets(analyzeRejections(apps));
      reco = Object.fromEntries(jobs.map((j) => [j.id, scoreScoutJob(j, profile, excluded)]));
      jobs.sort((a, b) => {
        const ra = reco![a.id];
        const rb = reco![b.id];
        if (ra.excluded !== rb.excluded) return ra.excluded ? 1 : -1;
        return rb.score - ra.score || (b.score ?? 0) - (a.score ?? 0);
      });
    }
  }

  return (
    <div className="mx-auto max-w-[1240px] px-4 py-6 md:px-6 md:py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-3">Discover</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
            Find your next role
          </h1>
          <p className="mt-1.5 text-[13.5px] text-ink-2">
            {reco
              ? "Open roles ranked by how closely they match your live pipeline — open one, read why, apply in a click."
              : "Roles your scout surfaced, ranked by fit. Open one, read why it matches, and apply in a click."}
          </p>
        </div>
        <ScoutSweep expiredCount={expiredCount} />
      </header>

      <JobBoard jobs={jobs} tab={tab} counts={counts} reco={reco} />
    </div>
  );
}

import { count, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { scoutJobs } from "@/lib/db/schema";
import { getScoutJobs } from "@/lib/queries";
import { JobBoard } from "@/components/job-board";

type Tab = "new" | "dismissed" | "promoted";

export default async function DiscoverPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab: rawTab } = await searchParams;
  const tab: Tab = rawTab === "dismissed" || rawTab === "promoted" ? rawTab : "new";

  const jobs = await getScoutJobs(tab);
  const counts = Object.fromEntries(
    await Promise.all(
      (["new", "dismissed", "promoted"] as Tab[]).map(async (s): Promise<[Tab, number]> => [
        s,
        (await db.select({ n: count() }).from(scoutJobs).where(eq(scoutJobs.status, s)).get())?.n ?? 0,
      ]),
    ),
  ) as Record<Tab, number>;

  return (
    <div className="mx-auto max-w-[1240px] px-4 py-6 md:px-6 md:py-8">
      <header className="mb-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-3">Discover</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
          Find your next role
        </h1>
        <p className="mt-1.5 text-[13.5px] text-ink-2">
          Roles your scout surfaced, ranked by fit. Open one, read why it matches, and apply in a click.
        </p>
      </header>

      <JobBoard jobs={jobs} tab={tab} counts={counts} />
    </div>
  );
}

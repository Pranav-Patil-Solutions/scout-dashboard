import { count, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { scoutJobs } from "@/lib/db/schema";
import { getScoutJobs } from "@/lib/queries";
import { TriageInbox } from "@/components/triage";

const GMAIL_SYNC = process.env.ENABLE_GMAIL_SYNC === "true";

type Tab = "new" | "dismissed" | "promoted";

export default async function TriagePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab: rawTab } = await searchParams;
  const tab: Tab = rawTab === "dismissed" || rawTab === "promoted" ? rawTab : "new";

  const jobs = getScoutJobs(tab);
  const counts = Object.fromEntries(
    (["new", "dismissed", "promoted"] as Tab[]).map((s) => [
      s,
      db.select({ n: count() }).from(scoutJobs).where(eq(scoutJobs.status, s)).get()?.n ?? 0,
    ]),
  ) as Record<Tab, number>;

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-6 md:px-6 md:py-8">
      <header className="mb-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-3">
          Scout Inbox
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
          Triage what the scout found
        </h1>
      </header>

      <TriageInbox jobs={jobs} tab={tab} counts={counts} />

      {/* Gmail sync — Phase 5 stretch, stubbed behind a flag (§8) */}
      <p className="mt-6 text-[11.5px] text-ink-3">
        Gmail status sync:{" "}
        {GMAIL_SYNC ? (
          <span className="text-[#fbb03b]">flag on, connector not configured — no-op</span>
        ) : (
          <>
            off — enable with <code className="rounded bg-white/[0.05] px-1 py-0.5">ENABLE_GMAIL_SYNC=true</code>{" "}
            in .env once a Gmail connector is available.
          </>
        )}
      </p>
    </div>
  );
}

import { CircleCheckBig, Inbox, ShieldCheck } from "lucide-react";
import { getPendingProposals, getSyncStatus } from "@/lib/queries";
import { ProposalCard, SyncButton } from "@/components/proposal-review";
import { fmtRelative } from "@/lib/format";

export default function InboxSyncPage() {
  const pending = getPendingProposals();
  const status = getSyncStatus();

  return (
    <div className="mx-auto max-w-[900px] px-4 py-6 md:px-6 md:py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-3">
            Email Sync
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
            Review what your inbox found
          </h1>
          <p className="mt-1 text-[12px] text-ink-3">
            {status.lastRunAt
              ? `Last sync ${fmtRelative(status.lastRunAt)}`
              : "Never synced"}
            {status.stats?.classified != null && (
              <span className="tnum"> · {status.stats.classified} emails classified</span>
            )}
            {status.resolvedToday > 0 && (
              <span className="tnum"> · {status.resolvedToday} resolved today</span>
            )}
          </p>
        </div>
        <SyncButton />
      </header>

      {/* §7 non-destructive promise, stated where decisions happen */}
      <div className="mb-5 flex items-center gap-2.5 rounded-xl border border-hairline bg-white/[0.02] px-4 py-2.5">
        <ShieldCheck className="size-4 shrink-0 text-accent-hi" />
        <p className="text-[12px] leading-snug text-ink-2">
          Nothing changes without you — every email becomes a proposal, and only
          accepted proposals touch the pipeline. Activity logs apply automatically
          at high confidence.
        </p>
      </div>

      {pending.length === 0 ? (
        <div className="flex items-center gap-3 rounded-2xl border border-hairline bg-card px-5 py-8">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#17c08a1f]">
            <CircleCheckBig className="size-5" style={{ color: "#17c08a" }} />
          </span>
          <div>
            <p className="text-sm font-semibold text-foreground">All caught up</p>
            <p className="text-[12px] text-ink-2">
              No proposals waiting. Run a sync to pull the latest from your inbox.
            </p>
          </div>
        </div>
      ) : (
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
            <Inbox className="size-4 text-accent-hi" />
            Needs review
            <span className="tnum rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-accent-hi">
              {pending.length}
            </span>
          </h2>
          <div className="space-y-2.5">
            {pending.map((item) => (
              <ProposalCard key={item.proposal.id} item={item} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

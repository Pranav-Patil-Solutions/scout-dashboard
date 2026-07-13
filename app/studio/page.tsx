import { Wand2 } from "lucide-react";
import { getScoutJobs } from "@/lib/queries";
import { StudioForm } from "@/components/studio-form";

export default async function StudioPage() {
  const jobs = await getScoutJobs("new");

  return (
    <div className="mx-auto max-w-[860px] px-4 py-6 md:px-6 md:py-8">
      <header className="mb-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-3">
          Kit Studio
        </p>
        <h1 className="mt-1 flex items-center gap-2.5 text-2xl font-semibold tracking-tight text-foreground">
          <Wand2 className="size-6 text-accent-hi" />
          Build a relatable CV + cover letter
        </h1>
        <p className="mt-2 max-w-[62ch] text-[13.5px] leading-relaxed text-ink-2">
          Pick a scouted job or paste any posting. The studio compares it against your real
          experience, writes a humanized one-page CV and cover letter grounded only in facts from
          your base resume, grades the result against the JD, and refines until it hits your target
          score. The kit lands on the application card, ready to send.
        </p>
      </header>

      <StudioForm jobs={jobs} />
    </div>
  );
}

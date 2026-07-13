"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FileText, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/**
 * Generate/Regenerate a tailored CV + cover letter (JOBDASH-005) and link the
 * PDFs once they exist. Generation is Mac-only; the API explains that when
 * pressed on the Vercel deployment.
 */
export function KitGenerator({ appId, hasKit }: { appId: string; hasKit: boolean }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);

  async function run() {
    setRunning(true);
    try {
      const res = await fetch(`/api/kit/${appId}`, { method: "POST" });
      const body = (await res.json()) as {
        ok: boolean;
        error?: string;
        resumePages?: number;
        warnings?: string[];
        grade?: { overall: number; verdict: string } | null;
      };
      if (!body.ok) throw new Error(body.error ?? "kit generation failed");
      toast.success(
        body.grade
          ? `Kit ready — CV graded ${body.grade.overall}/100`
          : "Kit ready — CV + cover letter generated",
        {
          description: body.warnings?.length
            ? body.warnings.join(" · ")
            : (body.grade?.verdict ?? "One-page CV tailored to the posting. Kit ready is now ON."),
        },
      );
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Kit generation failed.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-hairline/60 pt-3">
      <button
        type="button"
        disabled={running}
        onClick={run}
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[12px] font-semibold transition-all disabled:opacity-60",
          "border-0 bg-[linear-gradient(135deg,#7c6bf5,#4e7df0)] text-white shadow-[0_0_0_1px_rgba(155,140,255,0.3)] hover:brightness-110",
        )}
      >
        {running ? (
          <>
            <Loader2 className="size-3.5 animate-spin" /> Generating… ~2 min
          </>
        ) : (
          <>
            <Sparkles className="size-3.5" /> {hasKit ? "Regenerate kit" : "Generate kit"}
          </>
        )}
      </button>
      {hasKit && !running && (
        <>
          <KitLink href={`/api/kit/${appId}/resume.pdf`}>CV (PDF)</KitLink>
          <KitLink href={`/api/kit/${appId}/cover-letter.pdf`}>Cover letter (PDF)</KitLink>
        </>
      )}
      <span className="text-[11px] text-ink-3">
        {hasKit ? "Tailored from the live posting" : "Tailors your base CV to this posting · runs on the Mac"}
      </span>
    </div>
  );
}

function KitLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-hairline px-2.5 text-[12px] font-semibold text-ink-2 transition-colors hover:border-white/15 hover:text-foreground"
    >
      <FileText className="size-3.5" /> {children}
    </a>
  );
}

import { getBoardApplications } from "@/lib/queries";
import { Board } from "@/components/board";

export default async function PipelinePage() {
  const apps = await getBoardApplications();

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col">
      <div className="shrink-0 px-4 pt-6 md:px-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-3">
          Pipeline
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Board</h1>
      </div>
      <div className="mt-2 min-h-0 flex-1">
        <Board initial={apps} />
      </div>
    </div>
  );
}

import type { ComponentType } from "react";
import type { LucideProps } from "lucide-react";

/**
 * On-brand placeholder for routes wired up in a later gated phase.
 * Replaced by the real screen when its phase lands.
 */
export function ComingSoon({
  icon: Icon,
  title,
  body,
  phase,
}: {
  icon: ComponentType<LucideProps>;
  title: string;
  body: string;
  phase?: string;
}) {
  return (
    <div className="mx-auto flex min-h-[70dvh] max-w-[560px] flex-col items-center justify-center px-6 text-center">
      <span className="relative grid size-14 place-items-center rounded-2xl border border-hairline bg-card">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-2xl opacity-70 blur-xl"
          style={{ background: "radial-gradient(circle, rgba(124,107,245,0.25), transparent 70%)" }}
        />
        <Icon className="relative size-6 text-accent-hi" />
      </span>
      <h1 className="mt-5 text-lg font-semibold tracking-tight text-foreground">{title}</h1>
      <p className="mt-2 text-sm leading-relaxed text-ink-2">{body}</p>
      {phase && (
        <span className="mt-4 rounded-full border border-hairline bg-white/[0.02] px-3 py-1 text-[11px] font-medium text-ink-3">
          {phase}
        </span>
      )}
    </div>
  );
}

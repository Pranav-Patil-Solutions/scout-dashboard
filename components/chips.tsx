import { cn } from "@/lib/utils";
import {
  FIT_BAND_META,
  GERMAN_REQ_META,
  fitBandFor,
  sourceLabel,
  statusMeta,
  type GermanReq,
} from "@/lib/constants";

function tint(hex: string, alpha: number) {
  return `color-mix(in oklab, ${hex} ${alpha}%, transparent)`;
}

/** Status pill — colored dot + label. Used on board cards, detail, tables. */
export function StatusBadge({
  status,
  className,
  size = "md",
}: {
  status: string;
  className?: string;
  size?: "sm" | "md";
}) {
  const meta = statusMeta(status);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border font-medium",
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
        className,
      )}
      style={{
        color: meta.color,
        borderColor: tint(meta.color, 28),
        background: tint(meta.color, 10),
      }}
    >
      <span
        className="size-1.5 rounded-full"
        style={{ background: meta.color }}
      />
      {meta.label}
    </span>
  );
}

/** Fit-score chip, colored by band (strong/stretch/skip). */
export function FitChip({
  score,
  band,
  className,
  showLabel = false,
}: {
  score: number | null | undefined;
  band?: string | null;
  className?: string;
  showLabel?: boolean;
}) {
  const resolved = fitBandFor(band, score);
  if (score == null && !resolved) {
    return (
      <span
        className={cn(
          "inline-flex items-center rounded-md border border-hairline px-1.5 py-0.5 text-[11px] font-semibold text-ink-3",
          className,
        )}
      >
        —
      </span>
    );
  }
  const meta = resolved ? FIT_BAND_META[resolved] : { color: "#666b7d", label: "Unscored" };
  return (
    <span
      className={cn(
        "tnum inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold",
        className,
      )}
      style={{ color: meta.color, background: tint(meta.color, 14) }}
      title={meta.label}
    >
      {score ?? "—"}
      {showLabel && <span className="font-medium opacity-80">· {meta.label}</span>}
    </span>
  );
}

/** German-requirement indicator dot with an accessible label. */
export function GermanReqDot({
  req,
  withLabel = false,
  className,
}: {
  req: string | null | undefined;
  withLabel?: boolean;
  className?: string;
}) {
  const key = (req ?? "unknown") as GermanReq;
  const meta = GERMAN_REQ_META[key] ?? GERMAN_REQ_META.unknown;
  return (
    <span
      className={cn("inline-flex items-center gap-1.5", className)}
      title={`Language: ${meta.label}`}
    >
      <span className="size-2 rounded-full" style={{ background: meta.color }} />
      {withLabel && <span className="text-[11px] text-ink-2">{meta.label}</span>}
    </span>
  );
}

/** Source label chip. */
export function SourceTag({
  source,
  className,
}: {
  source: string | null | undefined;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border border-hairline bg-white/[0.02] px-1.5 py-0.5 text-[11px] font-medium text-ink-2",
        className,
      )}
    >
      {sourceLabel(source)}
    </span>
  );
}

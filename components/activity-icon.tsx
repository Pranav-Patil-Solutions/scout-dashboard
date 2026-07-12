import {
  BellRing,
  Mail,
  MailOpen,
  MailPlus,
  RefreshCw,
  StickyNote,
  Video,
} from "lucide-react";

const MAP: Record<string, { icon: typeof Mail; color: string }> = {
  status_change: { icon: RefreshCw, color: "#9b8cff" },
  note: { icon: StickyNote, color: "#8a8fa3" },
  email_in: { icon: MailOpen, color: "#17c08a" },
  email_out: { icon: Mail, color: "#5b8def" },
  interview: { icon: Video, color: "#17c08a" },
  follow_up: { icon: MailPlus, color: "#fbb03b" },
  reminder: { icon: BellRing, color: "#fbb03b" },
};

export function ActivityIcon({ type, size = "md" }: { type: string; size?: "sm" | "md" }) {
  const meta = MAP[type] ?? MAP.note;
  const Icon = meta.icon;
  const box = size === "sm" ? "size-6" : "size-7";
  const glyph = size === "sm" ? "size-3" : "size-3.5";
  return (
    <span
      className={`grid ${box} shrink-0 place-items-center rounded-lg`}
      style={{ background: `color-mix(in oklab, ${meta.color} 13%, transparent)` }}
    >
      <Icon className={glyph} style={{ color: meta.color }} />
    </span>
  );
}

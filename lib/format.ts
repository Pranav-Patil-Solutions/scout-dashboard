import { differenceInCalendarDays, format, formatDistanceToNowStrict } from "date-fns";

/** "16 Jun" style short date; em-dash when absent. */
export function fmtDate(date: Date | null | undefined): string {
  if (!date) return "—";
  return format(date, "d MMM");
}

/** "16 Jun 2026" full date. */
export function fmtDateLong(date: Date | null | undefined): string {
  if (!date) return "—";
  return format(date, "d MMM yyyy");
}

/** "16 Jun, 10:30" for timeline entries. */
export function fmtDateTime(date: Date | null | undefined): string {
  if (!date) return "—";
  return format(date, "d MMM, HH:mm");
}

/** "3d ago" / "in 2d". */
export function fmtRelative(date: Date | null | undefined): string {
  if (!date) return "—";
  return formatDistanceToNowStrict(date, { addSuffix: true });
}

/** Whole days between `date` and now (positive = in the past). */
export function daysAgo(date: Date | null | undefined, now: Date = new Date()): number | null {
  if (!date) return null;
  return differenceInCalendarDays(now, date);
}

/** Whole days until `date` (negative = overdue). */
export function daysUntil(date: Date | null | undefined, now: Date = new Date()): number | null {
  if (!date) return null;
  return differenceInCalendarDays(date, now);
}

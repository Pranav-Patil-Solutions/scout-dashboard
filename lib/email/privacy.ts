import type { Classification } from "./types";

/**
 * §8 enforcement — email bodies must never reach the DB, and classification
 * fields (evidence_quote, rationale) can carry verbatim body content when the
 * model saw a body (rules over full text, Sonnet escalation). This is the
 * single choke point: scrub before anything derived from a Classification is
 * persisted. A field "leaks" when a verbatim window of it exists in the body
 * but NOT in the persisted subject+snippet.
 */

export const BODY_REDACTED = "(evidence from email body — not stored)";

const WINDOW = 30;

function norm(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

export function leaksBody(field: string, body: string, visible: string): boolean {
  const f = norm(field);
  if (!f) return false;
  if (f.length < WINDOW) return body.includes(f) && !visible.includes(f);
  const starts: number[] = [];
  for (let i = 0; i + WINDOW <= f.length; i += 10) starts.push(i);
  starts.push(f.length - WINDOW);
  return starts.some((i) => {
    const win = f.slice(i, i + WINDOW);
    return body.includes(win) && !visible.includes(win);
  });
}

export function scrubClassification(
  c: Classification,
  subject: string | null,
  snippet: string | null,
  body?: string | null,
): Classification {
  if (!body) return c; // model only ever saw persisted fields — nothing can leak
  const b = norm(body);
  const visible = norm(`${subject ?? ""} ${snippet ?? ""}`);
  const scrub = (field: string) => (leaksBody(field, b, visible) ? BODY_REDACTED : field);
  return {
    ...c,
    evidence_quote: scrub(c.evidence_quote ?? ""),
    rationale: scrub(c.rationale ?? ""),
  };
}

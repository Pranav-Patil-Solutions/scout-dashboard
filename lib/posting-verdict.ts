/**
 * Pure verdict logic for the posting-expiry watchdog (no IO — unit-testable
 * and importable from client components for types). Detection is per-ATS and
 * structural — calibrated findings, 2026-07-13:
 *   · Ashby serves dead postings with HTTP 200; a LIVE posting server-renders
 *     an og:title meta, the dead shell doesn't.
 *   · join.com ships "This job is no longer available" inside its i18n bundle
 *     on EVERY page — bare text markers false-positive; the job's real state
 *     is `"status":"ONLINE"` inside __NEXT_DATA__.
 *   · SmartRecruiters' public postings API returns 200 published / 404 gone
 *     (handled in posting-check.ts, needs a fetch).
 * Anything ambiguous (network errors, unknown ATS on HTTP 200) is `unknown`
 * and NEVER acted on — a wrong auto-remove is worse than a stale card.
 */

export type PostingVerdict =
  | { state: "live" }
  | { state: "expired"; evidence: string }
  | { state: "unknown"; reason: string };

export interface PostingCheckStats {
  checked: number;
  live: number;
  expired: number;
  unknown: number;
  /** "Company — Role" labels of cards auto-moved to Missed */
  moved: string[];
}

export function verdictFromHtml(
  url: string,
  status: number,
  html: string,
): PostingVerdict {
  if (status === 404 || status === 410)
    return { state: "expired", evidence: `posting URL returns HTTP ${status}` };
  if (status >= 400) return { state: "unknown", reason: `HTTP ${status}` };

  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return { state: "unknown", reason: "unparseable URL" };
  }

  if (host.endsWith("ashbyhq.com")) {
    // Live postings SSR `og:title`; the "Job not found" shell has none.
    return /<meta property="og:title"/.test(html)
      ? { state: "live" }
      : {
          state: "expired",
          evidence: "Ashby serves the 'Job not found' shell (no posting data)",
        };
  }

  if (host === "join.com" || host.endsWith(".join.com")) {
    const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (!m) return { state: "unknown", reason: "join.com page missing __NEXT_DATA__" };
    try {
      const pageProps = JSON.stringify(
        (JSON.parse(m[1]) as { props?: { pageProps?: unknown } }).props?.pageProps ?? {},
      );
      if (pageProps.includes('"status":"ONLINE"')) return { state: "live" };
      const dead = pageProps.match(/"status":"(OFFLINE|ARCHIVED|CLOSED|EXPIRED)"/);
      if (dead) return { state: "expired", evidence: `join.com job status ${dead[1]}` };
      return { state: "unknown", reason: "join.com job status not found in page data" };
    } catch {
      return { state: "unknown", reason: "join.com __NEXT_DATA__ unparseable" };
    }
  }

  // Unknown ATS on a 2xx page: assume live — expiry needs positive evidence.
  return { state: "live" };
}

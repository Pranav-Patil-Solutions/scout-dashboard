import { describe, expect, it } from "vitest";
import { verdictFromHtml } from "../posting-verdict";

const ASHBY_URL = "https://jobs.ashbyhq.com/tacto/chief-of-staff";
const JOIN_URL = "https://join.com/companies/getweflowcom/16411761-founder-associate";

function joinPage(pagePropsJson: string, extraHtml = ""): string {
  return `<html><body>${extraHtml}<script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":${pagePropsJson}}}</script></body></html>`;
}

describe("verdictFromHtml", () => {
  it("treats HTTP 404/410 as expired on any domain", () => {
    expect(verdictFromHtml("https://example.com/job", 404, "").state).toBe("expired");
    expect(verdictFromHtml("https://example.com/job", 410, "").state).toBe("expired");
  });

  it("treats other HTTP errors as unknown, never expired", () => {
    expect(verdictFromHtml("https://example.com/job", 500, "").state).toBe("unknown");
    expect(verdictFromHtml("https://example.com/job", 403, "").state).toBe("unknown");
  });

  it("ashby: 200 shell without og:title is expired (dead pages return 200)", () => {
    const v = verdictFromHtml(ASHBY_URL, 200, "<html><title>Jobs</title></html>");
    expect(v.state).toBe("expired");
  });

  it("ashby: 200 with server-rendered og:title is live", () => {
    const v = verdictFromHtml(
      ASHBY_URL,
      200,
      '<html><meta property="og:title" content="Chief of Staff"/></html>',
    );
    expect(v.state).toBe("live");
  });

  it("join.com: ONLINE job status is live even when the i18n bundle contains tombstone text", () => {
    // Real trap: join.com ships "This job is no longer available" in its
    // translation strings on EVERY page. Only the structured status counts.
    const html = joinPage(
      '{"job":{"status":"ONLINE"}}',
      '<script>{"archivedJob.title":"This job is no longer available"}</script>',
    );
    expect(verdictFromHtml(JOIN_URL, 200, html).state).toBe("live");
  });

  it("join.com: OFFLINE/ARCHIVED job status is expired", () => {
    expect(
      verdictFromHtml(JOIN_URL, 200, joinPage('{"job":{"status":"OFFLINE"}}')).state,
    ).toBe("expired");
    expect(
      verdictFromHtml(JOIN_URL, 200, joinPage('{"job":{"status":"ARCHIVED"}}')).state,
    ).toBe("expired");
  });

  it("join.com: missing/unparseable page data is unknown, never expired", () => {
    expect(verdictFromHtml(JOIN_URL, 200, "<html>no next data</html>").state).toBe(
      "unknown",
    );
  });

  it("unknown ATS on a 200 page is live (expiry requires positive evidence)", () => {
    const v = verdictFromHtml(
      "https://careers.example.com/jobs/123",
      200,
      "<html>apply here</html>",
    );
    expect(v.state).toBe("live");
  });
});

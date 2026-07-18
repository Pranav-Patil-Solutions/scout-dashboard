import { NextResponse } from "next/server";
import { scrapeJobMeta } from "@/lib/scrape/job-meta";

/**
 * POST /api/scrape-meta — free job-posting meta scraper.
 * Body: { url }. Returns { ok, meta } with { title, company, location, salary,
 * description, remote, via }. Pure fetch + regex (JSON-LD → OG → body text),
 * no paid API and no Claude CLI, so it runs everywhere including Vercel
 * (NOT behind SYNC_DISABLED). Returns whatever it can extract — a sparse page
 * still yields ok:true with null fields, never a crash.
 */
export async function POST(req: Request) {
  let url: string;
  try {
    const body = (await req.json()) as { url?: unknown };
    if (typeof body.url !== "string" || !body.url.trim()) {
      return NextResponse.json(
        { ok: false, error: "A posting URL is required." },
        { status: 422 },
      );
    }
    url = body.url.trim();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  try {
    // eslint-disable-next-line no-new -- validate shape before fetching
    new URL(url);
  } catch {
    return NextResponse.json(
      { ok: false, error: "That doesn't look like a valid URL." },
      { status: 422 },
    );
  }

  try {
    const meta = await scrapeJobMeta(url);
    return NextResponse.json({ ok: true, meta });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Couldn't read that posting — it may be behind a login, expired, or blocking robots. Paste the JD text instead.",
      },
      { status: 502 },
    );
  }
}

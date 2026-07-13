import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { kitDir } from "@/lib/kit/generate";

/** GET /api/kit/[id]/[file] — serve a generated kit document (Mac-local files). */

const ALLOWED: Record<string, string> = {
  "resume.pdf": "application/pdf",
  "resume.html": "text/html; charset=utf-8",
  "cover-letter.pdf": "application/pdf",
  "cover-letter.html": "text/html; charset=utf-8",
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; file: string }> },
) {
  const { id, file } = await params;
  const contentType = ALLOWED[file];
  // allowlist + id shape check ⇒ no path traversal
  if (!contentType || !/^[a-zA-Z0-9-]+$/.test(id)) {
    return NextResponse.json({ ok: false, error: "Unknown kit file." }, { status: 404 });
  }
  try {
    const buf = await readFile(path.join(kitDir(id), file));
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "content-type": contentType,
        "content-disposition": `inline; filename="${file}"`,
        "cache-control": "no-store",
      },
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Kit file not found — generate the kit first (from the Mac)." },
      { status: 404 },
    );
  }
}

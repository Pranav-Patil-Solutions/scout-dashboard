import { type NextRequest, NextResponse } from "next/server";

/**
 * JOBDASH-003 §4 — HTTP Basic auth gate (Next 16: middleware is now "proxy",
 * root proxy.ts — see node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md).
 *
 * Active ONLY when BOTH BASIC_AUTH_USER and BASIC_AUTH_PASS are set (i.e. on
 * the Vercel deployment). When they're absent — local dev and the LAN prod
 * server — every request passes through untouched.
 */
export function proxy(request: NextRequest) {
  const user = process.env.BASIC_AUTH_USER;
  const pass = process.env.BASIC_AUTH_PASS;
  if (!user || !pass) return NextResponse.next();

  const header = request.headers.get("authorization");
  if (header?.startsWith("Basic ")) {
    try {
      const decoded = atob(header.slice(6));
      const sep = decoded.indexOf(":");
      if (
        sep !== -1 &&
        decoded.slice(0, sep) === user &&
        decoded.slice(sep + 1) === pass
      ) {
        return NextResponse.next();
      }
    } catch {
      // malformed base64 → fall through to the 401 challenge
    }
  }

  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Scout Control"' },
  });
}

import { clampText, htmlToText } from "./text";

/** Fetch the live posting and reduce it to plain JD text (clamped ~12k chars). */

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const MAX_JD_CHARS = 12_000;

export async function fetchJobDescription(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "user-agent": UA, accept: "text/html" },
    redirect: "follow",
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`JD fetch failed: HTTP ${res.status}`);
  const text = htmlToText(await res.text());
  if (text.length < 200) throw new Error("JD page had no usable text");
  return clampText(text, MAX_JD_CHARS);
}

/** Client-side fetch → JSON with human errors (Safari's raw "string did not
 * match the expected pattern" etc. must never reach a toast). Non-JSON bodies
 * mean a gateway/SSO layer answered instead of the app — say so plainly. */
export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw new Error("Network error — is the dashboard server reachable?");
  }
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(
      "This deployment couldn't run that action — kit generation and sync run on the Mac dashboard (localhost:3312).",
    );
  }
}

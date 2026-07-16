import { redirect } from "next/navigation";

/**
 * JOBDASH-006 §1 — the app opens on the work surface: the Discover apply
 * queue. Command Center lives at /command (nav · G C).
 */
export default function Home() {
  redirect("/triage");
}

import "server-only";
import { randomUUID } from "node:crypto";
import { cp, mkdir } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { activities, applications } from "../db/schema";
import { generateKit, kitDir, type KitResult } from "./generate";
import { persistGrade } from "./grade";

/**
 * Kit Studio loop (JOBDASH-005 v1.2): generate → grade → if the relatability
 * score misses the target, regenerate. Each regeneration automatically
 * consumes the previous grade's improvements (the feedback loop in
 * generate.ts).
 *
 * KEEP-BEST (v1.2.1): every round is snapshotted to kits/<id>/rounds/round-N/;
 * when the loop ends, the best-scoring round's files and grade are restored as
 * THE kit — the card only ever shows the optimized CV + cover letter, never a
 * worse later round (grader noise is real: a live run scored 42 → 40).
 */

const KIT_FILES = ["resume.html", "resume.pdf", "cover-letter.html", "cover-letter.pdf"];

export interface RefineRound {
  overall: number | null;
  verdict: string | null;
  warnings: string[];
}

export interface RefineResult {
  rounds: RefineRound[];
  /** 1-based index of the round whose files/grade are live on the card */
  keptRound: number;
  final: KitResult;
  reachedTarget: boolean;
}

async function snapshotRound(appId: string, round: number): Promise<void> {
  const src = kitDir(appId);
  const dst = path.join(src, "rounds", `round-${round}`);
  await mkdir(dst, { recursive: true });
  for (const f of KIT_FILES) await cp(path.join(src, f), path.join(dst, f));
}

async function restoreRound(appId: string, round: number): Promise<void> {
  const dir = kitDir(appId);
  const src = path.join(dir, "rounds", `round-${round}`);
  for (const f of KIT_FILES) await cp(path.join(src, f), path.join(dir, f));
}

export async function generateKitToTarget(
  appId: string,
  opts: { target?: number; maxRounds?: number } = {},
): Promise<RefineResult> {
  const target = Math.max(50, Math.min(95, opts.target ?? 80));
  const maxRounds = Math.max(1, Math.min(3, opts.maxRounds ?? 2));

  const rounds: RefineRound[] = [];
  const results: KitResult[] = [];
  for (let round = 1; ; round++) {
    const result = await generateKit(appId);
    results.push(result);
    rounds.push({
      overall: result.grade?.overall ?? null,
      verdict: result.grade?.verdict ?? null,
      warnings: result.warnings,
    });
    try {
      await snapshotRound(appId, round);
    } catch {
      // snapshot is best-effort — a failed copy must not kill the run
    }
    const overall = result.grade?.overall;
    if (overall == null || overall >= target || round >= maxRounds) break;
  }

  // keep the best round (ties → the later one, which absorbed more feedback)
  let best = results.length - 1;
  for (let i = 0; i < results.length; i++) {
    if ((results[i].grade?.overall ?? -1) > (results[best].grade?.overall ?? -1)) best = i;
  }
  const bestGrade = results[best].grade;
  if (best !== results.length - 1 && bestGrade) {
    try {
      await restoreRound(appId, best + 1);
      await persistGrade(
        appId,
        bestGrade,
        `Kept round ${best + 1} of ${results.length} (best grade ${bestGrade.overall}/100)`,
      );
    } catch {
      best = results.length - 1; // restore failed — the last round stays live
    }
  }

  const kept = results[best];
  const keptOverall = kept.grade?.overall ?? null;
  const reachedTarget = (keptOverall ?? 0) >= target;

  // THE BAR (v1.2.1): a kit that grades below target is never presented as
  // ready-to-send — files stay on the card for reading, but kit_ready stays
  // off so the Command Center won't push a below-bar application. A kit whose
  // grading failed entirely (keptOverall null) is NOT demoted — no grade is
  // not the same as a bad grade.
  if (!reachedTarget && keptOverall != null) {
    const now = new Date();
    await db
      .update(applications)
      .set({ isKitReady: false, updatedAt: now })
      .where(eq(applications.id, appId))
      .run();
    await db
      .insert(activities)
      .values({
        id: randomUUID(),
        applicationId: appId,
        type: "note",
        title: `Kit below the ${target} bar (${keptOverall}/100) — not marked ready`,
        body: kept.grade?.verdict ?? null,
        occurredAt: now,
        source: "system",
      })
      .run();
  }

  return {
    rounds,
    keptRound: best + 1,
    final: kept,
    reachedTarget,
  };
}

import "server-only";
import { generateKit, type KitResult } from "./generate";

/**
 * Kit Studio loop (JOBDASH-005 v1.2): generate → grade → if the relatability
 * score misses the target, regenerate. Each regeneration automatically
 * consumes the previous grade's improvements (the feedback loop in
 * generate.ts), so rounds converge instead of wandering.
 */

export interface RefineRound {
  overall: number | null;
  verdict: string | null;
  warnings: string[];
}

export interface RefineResult {
  rounds: RefineRound[];
  final: KitResult;
  reachedTarget: boolean;
}

export async function generateKitToTarget(
  appId: string,
  opts: { target?: number; maxRounds?: number } = {},
): Promise<RefineResult> {
  const target = Math.max(50, Math.min(95, opts.target ?? 80));
  const maxRounds = Math.max(1, Math.min(3, opts.maxRounds ?? 2));

  const rounds: RefineRound[] = [];
  let final: KitResult;
  for (let round = 1; ; round++) {
    final = await generateKit(appId);
    rounds.push({
      overall: final.grade?.overall ?? null,
      verdict: final.grade?.verdict ?? null,
      warnings: final.warnings,
    });
    const overall = final.grade?.overall;
    // stop on target reached, grading unavailable, or rounds exhausted
    if (overall == null || overall >= target || round >= maxRounds) {
      return { rounds, final, reachedTarget: (overall ?? 0) >= target };
    }
  }
}

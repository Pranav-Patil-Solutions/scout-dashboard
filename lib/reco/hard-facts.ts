/**
 * JOBDASH-010 — the small deterministic overlay the grader may NOT infer.
 *
 * Everything else (seniority band, domain fit, skills coverage) is read from the
 * base resume. These four facts are not safely readable from resume prose:
 *   · the resume asserts German work authorisation, which is Germany-scoped —
 *     "can he take a US role" does not follow from it;
 *   · it lists no direct reports, but absence of evidence is not evidence of
 *     absence to an LLM;
 *   · and the independent-work section describes five shipped products, which a
 *     grader will read as a founded company unless told otherwise.
 *
 * Bump `version` to invalidate every cached grade.
 */
export const HARD_FACTS = {
  version: 1,
  workAuth: { eu: true, germany: true, us: false, sponsorshipNeeded: false },
  german: "A2",
  peopleManagement: false,
  budgetOwnership: false,
  /** The independent products are side projects, not a founded startup. */
  startupFounder: false,
} as const;

/**
 * The framing rule, as the grader sees it. Lives next to the facts it enforces
 * so the two cannot drift apart.
 *
 * Why it matters twice: without it the grader reads five live products as
 * "founded and ran a company", inflates the seniority band into director/VP
 * territory, and then lets senior roles pass a gate they should fail. It would
 * also contradict the standing rule never to position on founder status.
 */
export const FRAMING_RULE = `The candidate's independent products (PetraOS, Granitopia, HandelOS/WerkOS, Stone Galleriem, AgentOS, and the job dashboard) are SELF-DIRECTED SIDE PROJECTS. They are NOT a founded startup and NOT a leadership role.
- peopleManagement, budgetOwnership and startupFounder are FALSE regardless of how that section of the resume reads. Do not infer any of them from the products, the umbrella brand name, or "sold it to a paying client".
- The products ARE evidence for mustHaveSkillsCoverage, domainFit and shipping ability. They must NEVER raise the seniority band.
- If the job requires director/VP/head-of level, team leadership, budget ownership, or "significant leadership experience", gate G2 FAILS. Five shipped side projects do not satisfy it.`;

export type HardFacts = typeof HARD_FACTS;

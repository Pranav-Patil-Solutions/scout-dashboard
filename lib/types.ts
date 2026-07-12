/** Serializable input for create/update application server actions. */
export interface ApplicationInput {
  company: string;
  roleTitle: string;
  source: string;
  status: string;
  fitScore: number | null;
  germanReq: string;
  location?: string | null;
  workMode?: string | null;
  seniority?: string | null;
  salaryRange?: string | null;
  applyUrl?: string | null;
  jdUrl?: string | null;
  isKitReady: boolean;
  resumeVariant?: string | null;
  coverPath?: string | null;
  nextAction?: string | null;
  /** yyyy-MM-dd from a <input type="date">, or null. */
  nextActionDue?: string | null;
  notes?: string | null;
  /** when set, creating the application promotes this scout_jobs row (§8). */
  scoutJobId?: string | null;
}

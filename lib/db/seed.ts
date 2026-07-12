import { randomUUID } from "node:crypto";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { sql } from "drizzle-orm";
import * as schema from "./schema";
import { activities, applications, scoutJobs } from "./schema";
import { deriveFitBand } from "../constants";

type Db = BetterSQLite3Database<typeof schema>;

const d = (iso: string) => new Date(iso);

interface SeedApp {
  company: string;
  roleTitle: string;
  source: string;
  fitScore: number;
  germanReq: string;
  location: string;
  workMode: string;
  seniority?: string;
  status: string;
  isKitReady?: boolean;
  resumeVariant?: string;
  coverPath?: string;
  salaryRange?: string;
  appliedAt?: Date;
  firstResponseAt?: Date;
  lastActivityAt: Date;
  nextAction?: string;
  nextActionDue?: Date;
  closedReason?: string;
  closedAt?: Date;
  applyUrl?: string;
  jdUrl?: string;
  notes: string;
  timeline: { type: string; title: string; body?: string; at: Date; source?: string }[];
}

/**
 * Pranav's real pipeline as of 2026-07-11 (§10).
 * On first load this must already surface: CEF AI follow-up (overdue),
 * WeFlow + Kadmos kits ready-not-sent, and MISSED = 1 (Moss).
 */
const SEED_APPS: SeedApp[] = [
  {
    company: "CEF AI",
    roleTitle: "Founder's Associate",
    source: "join",
    fitScore: 85,
    germanReq: "none",
    location: "Berlin",
    workMode: "hybrid",
    seniority: "early",
    status: "screening",
    appliedAt: d("2026-06-16T09:00:00Z"),
    firstResponseAt: d("2026-06-20T10:30:00Z"),
    lastActivityAt: d("2026-06-20T10:30:00Z"),
    nextAction: "Send follow-up on screening",
    nextActionDue: d("2026-06-30T09:00:00Z"),
    applyUrl: "https://join.com/cef-ai/founders-associate",
    jdUrl: "https://cef.ai/careers/founders-associate",
    salaryRange: "€55–70k",
    resumeVariant: "AI-forward",
    notes: "#2-fit style role. Intro call went well; moved to screening. Now silent.",
    timeline: [
      { type: "status_change", title: "Applied via Join", at: d("2026-06-16T09:00:00Z"), source: "manual" },
      { type: "email_in", title: "Recruiter replied — wants an intro call", at: d("2026-06-20T10:30:00Z"), source: "gmail" },
      { type: "status_change", title: "Moved to Screening", at: d("2026-06-20T10:35:00Z"), source: "system" },
    ],
  },
  {
    company: "Moss",
    roleTitle: "AI Operations Specialist",
    source: "cherry",
    fitScore: 82,
    germanReq: "none",
    location: "Berlin",
    workMode: "hybrid",
    seniority: "mid",
    status: "expired_missed",
    isKitReady: true,
    resumeVariant: "AI-forward",
    coverPath: "covers/moss-ai-ops.md",
    salaryRange: "€60–75k",
    closedReason: "expired_missed",
    closedAt: d("2026-06-28T23:59:00Z"),
    lastActivityAt: d("2026-06-08T12:00:00Z"),
    notes:
      "THE MISS. Kit (resume + cover) was ready 06-08 but never submitted; the posting closed 06-28 while it sat. This is why the dashboard exists.",
    timeline: [
      { type: "note", title: "Application kit prepared (AI-forward resume + cover)", at: d("2026-06-08T12:00:00Z"), source: "manual" },
      { type: "reminder", title: "Posting flagged as closing soon", body: "Never actioned.", at: d("2026-06-20T09:00:00Z"), source: "system" },
      { type: "reminder", title: "Posting expired — application never sent", at: d("2026-06-28T23:59:00Z"), source: "system" },
    ],
  },
  {
    company: "WeFlow",
    roleTitle: "Founder Associate (Success/Ops)",
    source: "indeed",
    fitScore: 80,
    germanReq: "none",
    location: "Remote",
    workMode: "remote",
    seniority: "early",
    status: "to_apply",
    isKitReady: true,
    resumeVariant: "EU-generalist",
    coverPath: "covers/weflow.md",
    salaryRange: "€50–65k",
    lastActivityAt: d("2026-07-05T15:00:00Z"),
    nextAction: "Submit application",
    nextActionDue: d("2026-07-12T09:00:00Z"),
    applyUrl: "https://join.com/companies/getweflowcom/16411761-founder-associate-success-ops-w-m-d-remote",
    notes: "Kit ready. Remote. Strong fit — send it before it ages like Moss.",
    timeline: [
      { type: "note", title: "Kit ready — resume + cover done", at: d("2026-07-05T15:00:00Z"), source: "manual" },
    ],
  },
  {
    company: "Kadmos",
    roleTitle: "Founder Associate",
    source: "smartrecruiters",
    fitScore: 74,
    germanReq: "bonus",
    location: "Berlin",
    workMode: "hybrid",
    seniority: "early",
    status: "to_apply",
    isKitReady: true,
    resumeVariant: "EU-generalist",
    coverPath: "covers/kadmos.md",
    salaryRange: "€55–68k",
    lastActivityAt: d("2026-07-06T11:00:00Z"),
    nextAction: "Submit application",
    nextActionDue: d("2026-07-13T09:00:00Z"),
    applyUrl: "https://jobs.smartrecruiters.com/Kadmos/743999775943124-founder-associate",
    notes: "Kit ready. German is a bonus, not required. Send this week.",
    timeline: [
      { type: "note", title: "Kit ready", at: d("2026-07-06T11:00:00Z"), source: "manual" },
    ],
  },
  {
    company: "telli",
    roleTitle: "AI Operations Intern",
    source: "ashby",
    fitScore: 60,
    germanReq: "none",
    location: "Berlin",
    workMode: "onsite",
    seniority: "intern",
    status: "rejected",
    appliedAt: d("2026-06-22T08:00:00Z"),
    closedReason: "rejected",
    closedAt: d("2026-06-23T14:00:00Z"),
    lastActivityAt: d("2026-06-23T14:00:00Z"),
    notes: "Fast rejection (<1 day). Intern-level — under-levelled for me.",
    timeline: [
      { type: "status_change", title: "Applied via Ashby", at: d("2026-06-22T08:00:00Z"), source: "manual" },
      { type: "status_change", title: "Rejected (fast, <1 day)", at: d("2026-06-23T14:00:00Z"), source: "gmail" },
    ],
  },
  {
    company: "Reonic",
    roleTitle: "Founders Associate Marketing",
    source: "ashby",
    fitScore: 55,
    germanReq: "none",
    location: "Remote",
    workMode: "remote",
    seniority: "early",
    status: "rejected",
    appliedAt: d("2026-06-18T08:00:00Z"),
    closedReason: "rejected",
    closedAt: d("2026-06-19T16:00:00Z"),
    lastActivityAt: d("2026-06-19T16:00:00Z"),
    notes: "Fast rejection. Marketing-tilted FA — off my core.",
    timeline: [
      { type: "status_change", title: "Applied via Ashby", at: d("2026-06-18T08:00:00Z"), source: "manual" },
      { type: "status_change", title: "Rejected (fast)", at: d("2026-06-19T16:00:00Z"), source: "gmail" },
    ],
  },
  {
    company: "voize",
    roleTitle: "AI Enablement Engineer",
    source: "ashby",
    fitScore: 58,
    germanReq: "none",
    location: "Remote",
    workMode: "remote",
    seniority: "mid",
    status: "rejected",
    appliedAt: d("2026-06-20T08:00:00Z"),
    closedReason: "rejected",
    closedAt: d("2026-06-25T13:00:00Z"),
    lastActivityAt: d("2026-06-25T13:00:00Z"),
    notes: "Rejected. Engineer-titled — over-specialised for my profile. The pattern.",
    timeline: [
      { type: "status_change", title: "Applied via Ashby", at: d("2026-06-20T08:00:00Z"), source: "manual" },
      { type: "status_change", title: "Rejected", at: d("2026-06-25T13:00:00Z"), source: "gmail" },
    ],
  },
  {
    company: "Overfly",
    roleTitle: "Open application (cold)",
    source: "cold-email",
    fitScore: 70,
    germanReq: "none",
    location: "Berlin",
    workMode: "hybrid",
    seniority: "early",
    status: "applied",
    appliedAt: d("2026-06-25T09:00:00Z"),
    lastActivityAt: d("2026-06-25T09:00:00Z"),
    nextAction: "Follow up — no reply yet",
    nextActionDue: d("2026-07-05T09:00:00Z"),
    notes: "Cold open application. No response yet.",
    timeline: [
      { type: "email_out", title: "Sent cold open application", at: d("2026-06-25T09:00:00Z"), source: "gmail" },
    ],
  },
];

const SEED_SCOUT_JOBS = [
  {
    source: "join",
    title: "Founders Associate",
    company: "Pliant",
    url: "https://join.com/pliant/founders-associate",
    score: 78,
    reason: "Strong FA fit; Berlin; English-first; fintech ops.",
    languageFlag: "en",
    firstSeen: d("2026-07-09T06:00:00Z"),
  },
  {
    source: "ashby",
    title: "Chief of Staff",
    company: "Tacto",
    url: "https://jobs.ashbyhq.com/tacto/chief-of-staff",
    score: 81,
    reason: "CoS; ops-heavy; procurement-adjacent; EN-first.",
    languageFlag: "en",
    firstSeen: d("2026-07-10T06:00:00Z"),
  },
  {
    source: "greenhouse",
    title: "Operations Manager (Procurement)",
    company: "Scoutbee",
    url: "https://boards.greenhouse.io/scoutbee/operations-procurement",
    score: 72,
    reason: "Procurement ops; hybrid Berlin; German a plus.",
    languageFlag: "de_en",
    firstSeen: d("2026-07-08T06:00:00Z"),
  },
  {
    source: "indeed",
    title: "Working Student Marketing",
    company: "Nelly",
    url: "https://indeed.com/nelly/working-student-marketing",
    score: 40,
    reason: "Low fit; marketing; German required — down-ranked.",
    languageFlag: "de",
    firstSeen: d("2026-07-07T06:00:00Z"),
  },
];

export function seedIfEmpty(db: Db): void {
  const existing = db
    .select({ n: sql<number>`count(*)` })
    .from(applications)
    .get();
  if (existing && existing.n > 0) return;

  db.transaction((tx) => {
    for (const a of SEED_APPS) {
      const id = randomUUID();
      tx.insert(applications)
        .values({
          id,
          company: a.company,
          roleTitle: a.roleTitle,
          source: a.source,
          fitScore: a.fitScore,
          fitBand: deriveFitBand(a.fitScore),
          germanReq: a.germanReq,
          location: a.location,
          workMode: a.workMode,
          seniority: a.seniority ?? null,
          status: a.status,
          isKitReady: a.isKitReady ?? false,
          resumeVariant: a.resumeVariant ?? null,
          coverPath: a.coverPath ?? null,
          salaryRange: a.salaryRange ?? null,
          applyUrl: a.applyUrl ?? null,
          jdUrl: a.jdUrl ?? null,
          appliedAt: a.appliedAt ?? null,
          firstResponseAt: a.firstResponseAt ?? null,
          lastActivityAt: a.lastActivityAt,
          nextAction: a.nextAction ?? null,
          nextActionDue: a.nextActionDue ?? null,
          closedReason: a.closedReason ?? null,
          closedAt: a.closedAt ?? null,
          notes: a.notes,
        })
        .run();

      for (const ev of a.timeline) {
        tx.insert(activities)
          .values({
            id: randomUUID(),
            applicationId: id,
            type: ev.type,
            title: ev.title,
            body: ev.body ?? null,
            occurredAt: ev.at,
            source: ev.source ?? "manual",
          })
          .run();
      }
    }

    for (const j of SEED_SCOUT_JOBS) {
      tx.insert(scoutJobs)
        .values({ id: randomUUID(), status: "new", ...j })
        .run();
    }
  });
}

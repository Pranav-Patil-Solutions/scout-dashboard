import type { Application, EmailEvent } from "../../db/schema";
import type { Classification } from "../types";

/**
 * Test-only factories. Full DB row shapes aren't relevant to the pure logic
 * under test (match/propose/rules never touch a database), so these fill in
 * schema-required fields with neutral defaults and let callers override just
 * what the scenario cares about.
 */

export function makeApp(overrides: Partial<Application> = {}): Application {
  return {
    id: "app-1",
    company: "Acme",
    roleTitle: "Engineer",
    source: "scraper",
    fitScore: null,
    fitBand: null,
    germanReq: "unknown",
    location: null,
    workMode: null,
    seniority: null,
    applyUrl: null,
    jdUrl: null,
    status: "applied",
    isKitReady: false,
    resumeVariant: null,
    coverPath: null,
    salaryRange: null,
    appliedAt: null,
    firstResponseAt: null,
    lastActivityAt: null,
    nextAction: null,
    nextActionDue: null,
    snoozedUntil: null,
    kitGrade: null,
    kitGradedAt: null,
    closedReason: null,
    closedAt: null,
    notes: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

export function makeEvent(overrides: Partial<EmailEvent> = {}): EmailEvent {
  return {
    id: "evt-1",
    gmailMessageId: "gmail-1",
    threadId: "thread-1",
    sender: "jobs@greenhouse.io",
    subject: "Update on your application",
    snippet: "...",
    receivedAt: new Date("2026-02-01T00:00:00Z"),
    direction: "inbound",
    classification: null,
    matchedApplicationId: null,
    processedAt: null,
    ...overrides,
  };
}

export function makeClassification(overrides: Partial<Classification> = {}): Classification {
  return {
    is_job_related: true,
    category: "application_confirmation",
    company: "Acme",
    role_title: "Engineer",
    ats_platform: null,
    decision_sentiment: "neutral",
    confidence: 0.9,
    interview_datetimes: [],
    evidence_quote: "",
    rationale: "test",
    classified_by: "rules",
    ...overrides,
  };
}

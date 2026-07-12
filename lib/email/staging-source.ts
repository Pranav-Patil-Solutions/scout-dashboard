import "server-only";
import fs from "node:fs";
import path from "node:path";
import type { EmailSource, FetchResult, RawEmail } from "./types";

const STAGING_DIR = path.join(process.cwd(), ".gmail-staging");

interface StagingFile {
  fetchedAt: string;
  emails: RawEmail[];
}

/**
 * v1 EmailSource — reads RawEmail dumps the Claude Code session produced via
 * the Gmail MCP connector (fetch spec: docs/gmail-fetch-spec.md). Resilient to
 * a missing dir / malformed files; dedupe happens downstream on message id.
 */
export const stagingSource: EmailSource = {
  name: "gmail",

  async fetchSince(cursor: string | null): Promise<FetchResult> {
    if (!fs.existsSync(STAGING_DIR)) return { emails: [], nextCursor: cursor };

    const files = fs
      .readdirSync(STAGING_DIR)
      .filter((f) => f.endsWith(".json"))
      .sort();

    const cutoff = cursor ? Date.parse(cursor) : null;
    const byId = new Map<string, RawEmail>();

    for (const file of files) {
      try {
        const parsed = JSON.parse(
          fs.readFileSync(path.join(STAGING_DIR, file), "utf-8"),
        ) as StagingFile;
        for (const email of parsed.emails ?? []) {
          if (!email.gmailMessageId || !email.receivedAt) continue;
          if (cutoff != null && Date.parse(email.receivedAt) <= cutoff) continue;
          byId.set(email.gmailMessageId, email);
        }
      } catch {
        // a malformed staging file must never kill a sync — skip it
        continue;
      }
    }

    const emails = [...byId.values()].sort(
      (a, b) => Date.parse(a.receivedAt) - Date.parse(b.receivedAt),
    );
    const nextCursor = emails.length
      ? emails[emails.length - 1].receivedAt
      : cursor;

    return { emails, nextCursor };
  },
};

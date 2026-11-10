import { serverApiFetch } from "@/lib/api";
import type { SampleJob } from "@/components/app-v2/sample-data";
import { matchToJob, type ApiMatch } from "./job-utils";

export interface JobsData {
  /** The user's real daily matches; `[]` when there are none (a sample list is the pages' business: `samples()`, U0.5). */
  jobs: SampleJob[];
  /** True when `jobs` are the user's real daily matches. */
  real: boolean;
  /** Daily-matches switch state; undefined when the account isn't entitled to matches. */
  matchEnabled?: boolean;
}

interface MatchesPayload {
  setting?: { enabled?: boolean };
  matches?: ApiMatch[];
}

/**
 * Jobs for Home / Job Search / Job detail. Pro accounts get their real daily matches
 * (`/api/profile/job-matches`); everyone else, and Pro accounts with an empty list, get `real: false` and no
 * jobs: the page decides what to show (an honest empty state; the board's sample rows only for a demo
 * account on a sample-enabled build). The endpoint answers with an error for Free, which just means "no real
 * matches". Never throws.
 */
export async function loadJobs(): Promise<JobsData> {
  try {
    const res = await serverApiFetch("/api/profile/job-matches");
    if (res.ok) {
      const data = (await res.json().catch(() => null)) as MatchesPayload | null;
      const matches = Array.isArray(data?.matches) ? data.matches : [];
      const now = Date.now();
      if (matches.length > 0) {
        return {
          jobs: matches.map((m) => matchToJob(m, now)),
          real: true,
          matchEnabled: data?.setting?.enabled,
        };
      }
      return { jobs: [], real: false, matchEnabled: data?.setting?.enabled };
    }
  } catch {
    // no matches is fine
  }
  return { jobs: [], real: false };
}

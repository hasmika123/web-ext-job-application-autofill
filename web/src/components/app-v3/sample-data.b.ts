/**
 * SAMPLE — board data, not from the API; replace when the feature ships.
 * App v3 phase V3-B (Applications, My Profiles, Saved Jobs, Settings). QA merges this into the one
 * `app-v3/sample-data.ts`. Real data (applications, resumes, account, billing) replaces these
 * wherever the API has it; these rows render when a real list is empty so the page matches the board.
 */
import type { AppStatusKey } from "../app-v2/sample-data";

/* ── 2.3 Applications ───────────────────────────────────────────────────────────────────────── */

export interface V3ApplicationSample {
  id: string;
  title: string;
  company: string;
  sub: string;
  status: AppStatusKey;
  appliedOn: string;
  nextStep: string;
  nextStepDetail?: string;
  href?: string | null;
}

export const V3_APPLICATION_ROWS: V3ApplicationSample[] = [
  { id: "a3-1", title: "Software Engineer", company: "Google", sub: "Full-time · Mountain View, CA", status: "interview", appliedOn: "Oct 8, 2026", nextStep: "Oct 10, 10:00 AM", nextStepDetail: "Video Interview" },
  { id: "a3-2", title: "Frontend Developer", company: "Microsoft", sub: "Full-time · Redmond, WA", status: "in-review", appliedOn: "Oct 6, 2026", nextStep: "—" },
  { id: "a3-3", title: "SDE II", company: "Amazon", sub: "Full-time · Seattle, WA", status: "applied", appliedOn: "Oct 3, 2026", nextStep: "—" },
  { id: "a3-4", title: "Product Engineer", company: "Microsoft", sub: "Full-time · Remote", status: "applied", appliedOn: "Oct 2, 2026", nextStep: "—" },
  { id: "a3-5", title: "Frontend Engineer", company: "Meta", sub: "Full-time · Remote", status: "rejected", appliedOn: "Oct 1, 2026", nextStep: "—" },
  { id: "a3-6", title: "Full Stack Developer", company: "Netflix", sub: "Full-time · Los Gatos, CA", status: "in-review", appliedOn: "Sep 28, 2026", nextStep: "—" },
  { id: "a3-7", title: "Software Engineer", company: "Uber", sub: "Full-time · San Francisco, CA", status: "interview", appliedOn: "Sep 25, 2026", nextStep: "Oct 12, 3:00 PM", nextStepDetail: "Technical" },
  { id: "a3-8", title: "Frontend Developer", company: "Shopify", sub: "Full-time · Remote", status: "applied", appliedOn: "Sep 22, 2026", nextStep: "—" },
  { id: "a3-9", title: "Software Engineer", company: "Tesla", sub: "Full-time · Palo Alto, CA", status: "offer", appliedOn: "Sep 20, 2026", nextStep: "Review offer" },
  { id: "a3-10", title: "Backend Engineer", company: "Stripe", sub: "Full-time · Remote", status: "applied", appliedOn: "Sep 18, 2026", nextStep: "—" },
];

/** Tab counts as drawn on the board (used only with the sample rows). */
export const V3_APPLICATION_SAMPLE_COUNTS = { all: 42, applied: 18, "in-review": 10, interview: 8, offer: 5, rejected: 1 } as const;

/* ── 2.4 My Profiles ────────────────────────────────────────────────────────────────────────── */

export const V3_PROFILE_FALLBACK = {
  title: "Software Engineer",
  location: "San Francisco, CA",
  about:
    "Results-driven Software Engineer with 5+ years of experience building scalable web applications using React, Node.js and cloud technologies. Passionate about intuitive user experiences and solving complex problems.",
  skills: ["React", "TypeScript", "Node.js", "Next.js", "AWS", "Python"],
};

/** The "Multiple Profiles" row (the feature is not built yet; the first chip takes the user's title). */
export const V3_PROFILE_VARIANTS = ["Software Engineer", "Frontend Developer", "Data Scientist"] as const;

export const V3_RESUME_VERSION_SAMPLES = [
  { id: 0, label: "Software Engineer Resume", date: "Oct 8, 2026", isDefault: true },
  { id: -1, label: "Frontend Developer Resume", date: "Sep 30, 2026", isDefault: false },
  { id: -2, label: "Product Manager Resume", date: "Sep 12, 2026", isDefault: false },
];

/* ── 2.10 Saved Jobs ────────────────────────────────────────────────────────────────────────── */

export type V3SavedState = "to-apply" | "applied" | "not-interested";

export interface V3SavedJob {
  id: string;
  title: string;
  company: string;
  location: string;
  mode: string;
  salary?: string;
  tags: string[];
  /** Sort key for "Recently Saved" (0 = today). */
  savedDaysAgo: number;
  savedLabel: string;
  state: V3SavedState;
}

const J = (
  id: number,
  title: string,
  company: string,
  location: string,
  mode: string,
  tags: string[],
  savedDaysAgo: number,
  savedLabel: string,
  state: V3SavedState,
  salary?: string,
): V3SavedJob => ({ id: `s3-${id}`, title, company, location, mode, salary, tags, savedDaysAgo, savedLabel, state });

/** The first six are the board's rows; the rest bring the tab counts to 18 / 12 / 4 / 2. */
export const V3_SAVED_JOBS: V3SavedJob[] = [
  J(1, "Software Engineer", "Google", "Mountain View, CA", "Remote", ["React", "TypeScript", "Next.js"], 2, "2 days ago", "to-apply", "$140K–$180K"),
  J(2, "Frontend Developer", "Microsoft", "Redmond, WA", "Hybrid", ["React", "Tailwind", "JavaScript"], 3, "3 days ago", "to-apply"),
  J(3, "Full Stack Engineer", "Airbnb", "San Francisco, CA", "Remote", ["Node.js", "React", "AWS"], 5, "5 days ago", "to-apply"),
  J(4, "Product Engineer", "Stripe", "San Francisco, CA", "Hybrid", ["React", "Node.js", "System Design"], 7, "1 week ago", "to-apply"),
  J(5, "SDE II", "Amazon", "Seattle, WA", "Full-time", ["Java", "AWS"], 8, "1 week ago", "to-apply"),
  J(6, "Software Engineer", "Netflix", "Los Gatos, CA", "On-site", ["Python", "React", "Node.js"], 14, "2 weeks ago", "to-apply"),
  J(7, "Frontend Engineer", "Meta", "Menlo Park, CA", "Hybrid", ["React", "GraphQL", "TypeScript"], 15, "2 weeks ago", "to-apply"),
  J(8, "Backend Engineer", "Uber", "San Francisco, CA", "Remote", ["Go", "Kafka", "AWS"], 16, "2 weeks ago", "to-apply"),
  J(9, "Software Engineer II", "Shopify", "Remote", "Remote", ["Ruby", "React", "GraphQL"], 18, "2 weeks ago", "to-apply"),
  J(10, "Platform Engineer", "Databricks", "San Francisco, CA", "Hybrid", ["Scala", "Spark", "Kubernetes"], 20, "3 weeks ago", "to-apply"),
  J(11, "Web Developer", "Adobe", "San Jose, CA", "Hybrid", ["JavaScript", "React", "CSS"], 21, "3 weeks ago", "to-apply"),
  J(12, "Full Stack Developer", "Atlassian", "Remote", "Remote", ["Java", "React", "AWS"], 24, "3 weeks ago", "to-apply"),
  J(13, "Software Engineer", "Apple", "Cupertino, CA", "On-site", ["Swift", "iOS"], 26, "4 weeks ago", "applied"),
  J(14, "Frontend Developer", "Spotify", "New York, NY", "Hybrid", ["React", "TypeScript"], 28, "4 weeks ago", "applied"),
  J(15, "SDE I", "Amazon", "Seattle, WA", "Full-time", ["Java", "DynamoDB"], 30, "1 month ago", "applied"),
  J(16, "Product Engineer", "Notion", "San Francisco, CA", "Hybrid", ["TypeScript", "React"], 32, "1 month ago", "applied"),
  J(17, "Data Engineer", "Salesforce", "San Francisco, CA", "Hybrid", ["Python", "SQL"], 35, "1 month ago", "not-interested"),
  J(18, "Support Engineer", "Oracle", "Austin, TX", "On-site", ["SQL", "Linux"], 40, "1 month ago", "not-interested"),
];

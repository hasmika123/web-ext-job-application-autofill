import {
  GOOGLE_DETAIL,
  type JobDetailContent,
  type SampleJob,
  type WorkMode,
} from "@/components/app-v2/sample-data";

/** The job as the split-view board draws it (same job, slightly different numbers). */
export function asSplit(job: SampleJob): SampleJob {
  return { ...job, ...job.split, split: undefined };
}

/** "Mountain View, CA · Remote" style meta line (company is added by the caller). */
export function metaLine(job: SampleJob, withCompany = true): string {
  return [withCompany ? job.company : null, job.location || null, job.mode].filter(Boolean).join(" · ");
}

export function scoreTone(score: number): "green" | "amber" {
  return score >= 90 ? "green" : "amber";
}

/** Look up a job by id in a list (sample + real). */
export function findJob(jobs: SampleJob[], id: string): SampleJob | undefined {
  return jobs.find((j) => j.id === id);
}

/** The ordered list the Previous/Next buttons cycle through. */
export function neighbours(jobs: SampleJob[], id: string): { prev: SampleJob | null; next: SampleJob | null } {
  const i = jobs.findIndex((j) => j.id === id);
  if (i < 0 || jobs.length < 2) return { prev: null, next: null };
  return { prev: jobs[(i - 1 + jobs.length) % jobs.length], next: jobs[(i + 1) % jobs.length] };
}

export interface ApiMatch {
  id: number;
  score: number;
  reason: string | null;
  title: string;
  company: string;
  location: string | null;
  workplaceType: "REMOTE" | "HYBRID" | "ONSITE" | null;
  employmentType: string | null;
  url: string;
  applyUrl: string | null;
  publishedAt: string;
  ats: string;
}

const MODE: Record<string, WorkMode> = { REMOTE: "Remote", HYBRID: "Hybrid", ONSITE: "On-site" };

function pretty(s: string): string {
  return s
    .toLowerCase()
    .split(/[_\s]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function ago(iso: string, now: number): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "Recently";
  const days = Math.floor((now - t) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

/** A real daily match, in the shape the job pages draw. Ids are `m-<matchId>`. */
export function matchToJob(m: ApiMatch, now = Date.now()): SampleJob {
  const tags = [m.employmentType ? pretty(m.employmentType) : null, pretty(m.ats)].filter((t): t is string => !!t);
  return {
    id: `m-${m.id}`,
    title: m.title,
    company: m.company,
    location: m.location ?? "",
    mode: m.workplaceType ? (MODE[m.workplaceType] ?? null) : null,
    tags,
    score: Math.round(m.score),
    posted: ago(m.publishedAt, now),
    real: { reason: m.reason, url: m.url, applyUrl: m.applyUrl },
  };
}

/**
 * Detail content for any job. Google's is the board's verbatim copy; every other job gets the same
 * structure generated from its own fields (title, company, location), so each sample card opens a
 * complete page. Real matches get their own AI reason in the description.
 */
export function detailFor(job: SampleJob): JobDetailContent {
  if (job.id === "google-swe-intern") return GOOGLE_DETAIL;
  const g = GOOGLE_DETAIL;
  const reason = job.real?.reason;
  const real = !!job.real;
  return {
    ...g,
    // Sample jobs borrow the board's numbers; a real match only shows what the posting says.
    salary: real ? "Not listed" : "$7K - $10K/month",
    applicants: real ? "Applicants not listed" : "820 applicants",
    workMode: job.mode ?? "Not listed",
    duration: real ? "Not listed" : "Summer 2027",
    monthly: real ? "Not listed" : "$6,500 - $9,000",
    description:
      reason ||
      `Join ${job.company} as a ${job.title} and work with experienced engineers on real projects. You'll contribute to meaningful work, learn from your team, and grow in a supportive environment.`,
    responsibilities: g.responsibilities.map((r) => r.replace("Google's", `${job.company}'s`)),
    match: { ...g.match, value: job.score },
    stickyNote: "Big ideas start with great interns!",
    postedDetail: `Posted ${job.posted.toLowerCase()}`,
    applications: real ? "Applications: not listed" : "Applications: 1,120",
    about: {
      name: job.company,
      blurb: `${job.company} is hiring for ${job.title}.`,
      industry: "Technology",
      size: "Not listed",
      hq: job.location || "Not listed",
      site: job.real?.url ?? "",
    },
    additional: { ...g.additional, website: job.real?.url ?? "", deadline: real ? "Not listed" : "Jan 31, 2027" },
    verified: !job.real,
  };
}

import type { SampleJob } from "@/components/app-v2/sample-data";
import {
  GOOGLE_V3_DETAIL,
  JOB_COMPANIES,
  type JobLevel,
  type JobType,
  type V3Detail,
  type V3Job,
} from "@/components/app-v3/sample-data.a";

/** Filter state of the Job Search rail. Empty sets / "" mean "no filter on that facet". */
export interface Filters {
  q: string;
  remote: boolean;
  us: boolean;
  other: boolean;
  location: string;
  types: JobType[];
  /** Minimum salary in $k (0 = off): keeps jobs whose top of range reaches it. */
  minSalaryK: number;
  levels: JobLevel[];
  companies: string[];
  companyQuery: string;
}

/** The board's starting point: Full-time ticked, nothing else. */
export function defaultFilters(q = ""): Filters {
  return { q, remote: false, us: false, other: false, location: "", types: ["Full-time"], minSalaryK: 0, levels: [], companies: [], companyQuery: "" };
}

export function isDefault(f: Filters, q = ""): boolean {
  const d = defaultFilters(q);
  return (
    f.q.trim() === d.q.trim() &&
    !f.remote && !f.us && !f.other && f.location.trim() === "" &&
    f.types.length === 1 && f.types[0] === "Full-time" &&
    f.minSalaryK === 0 && f.levels.length === 0 && f.companies.length === 0 && f.companyQuery.trim() === ""
  );
}

export type Sort = "relevant" | "newest" | "salary";
export const SORTS: { id: Sort; label: string }[] = [
  { id: "relevant", label: "Most relevant" },
  { id: "newest", label: "Newest" },
  { id: "salary", label: "Highest salary" },
];

const US_RE = /,\s*[A-Z]{2}$/;
const isUs = (j: V3Job) => US_RE.test(j.location) || j.location === "Remote";

export function applyFilters(jobs: V3Job[], f: Filters, sort: Sort): V3Job[] {
  const words = f.q.toLowerCase().split(/\s+/).filter(Boolean);
  const loc = f.location.trim().toLowerCase();
  const cq = f.companyQuery.trim().toLowerCase();
  const anyWhere = f.remote || f.us || f.other;
  const out = jobs.filter((j) => {
    if (words.length) {
      const hay = [j.title, j.company, j.location, j.mode ?? "", ...j.tags].join(" ").toLowerCase();
      if (!words.every((w) => hay.includes(w))) return false;
    }
    if (anyWhere) {
      const ok = (f.remote && j.mode === "Remote") || (f.us && isUs(j)) || (f.other && !isUs(j));
      if (!ok) return false;
    }
    if (loc && !j.location.toLowerCase().includes(loc)) return false;
    if (f.types.length && j.type && !f.types.includes(j.type)) return false;
    if (f.minSalaryK > 0 && j.salaryMax !== null && j.salaryMax < f.minSalaryK) return false;
    if (f.levels.length && j.level && !f.levels.includes(j.level)) return false;
    if (f.companies.length && !f.companies.includes(j.company)) return false;
    if (cq && !j.company.toLowerCase().includes(cq)) return false;
    return true;
  });
  return out.sort((a, b) =>
    sort === "newest" ? a.ageDays - b.ageDays || b.score - a.score : sort === "salary" ? (b.salaryMax ?? 0) - (a.salaryMax ?? 0) : b.score - a.score,
  );
}

/** Facet companies: the board's five plus any other company in the list (real matches). */
export function companyFacets(jobs: V3Job[]): string[] {
  const extra = [...new Set(jobs.map((j) => j.company))].filter((c) => !JOB_COMPANIES.includes(c));
  return [...JOB_COMPANIES, ...extra.slice(0, 5)];
}

function ageOf(posted: string): number {
  const m = /^(\d+)\s*(day|week)/i.exec(posted);
  if (m) return Number(m[1]) * (m[2].toLowerCase() === "week" ? 7 : 1);
  return posted === "Today" ? 0 : 30;
}

function typeOf(tags: string[]): JobType | null {
  const t = tags.join(" ").toLowerCase();
  if (t.includes("part")) return "Part-time";
  if (t.includes("contract")) return "Contract";
  if (t.includes("intern")) return "Internship";
  if (t.includes("full")) return "Full-time";
  return null;
}

/** A real daily match drawn as a Job Search row: facets it doesn't have are null (they pass every filter). */
export function realToV3(j: SampleJob): V3Job {
  return { ...j, type: typeOf(j.tags), level: null, salary: null, salaryMax: null, ageDays: ageOf(j.posted) };
}

/** Detail copy: Google's is the board's; other sample jobs reuse its structure with their own names; real matches say what they know. */
export function detailV3(job: V3Job): V3Detail {
  if (job.real) {
    return {
      about: job.real.reason || "Open the posting for the full description.",
      doing: [],
      requirements: [],
      benefits: [],
      company: { blurb: `${job.company} is hiring for ${job.title}.`, industry: "Not listed", size: "Not listed", hq: job.location || "Not listed" },
      reviews: { rating: "", count: "", quote: "" },
    };
  }
  if (job.id === "google-swe") return GOOGLE_V3_DETAIL;
  const g = GOOGLE_V3_DETAIL;
  const swap = (s: string) => s.replace(/Google/g, job.company);
  return {
    about: `Join ${job.company} as a ${job.title} and build products people rely on every day. You'll work with experienced teammates, own meaningful pieces of the roadmap and grow quickly.`,
    doing: g.doing,
    requirements: [`Experience with ${job.tags.slice(0, 2).join(" and ") || "modern tooling"}`, ...g.requirements.slice(1)],
    benefits: g.benefits,
    company: { blurb: `${job.company}: a leader in technology, hiring for ${job.title}.`, industry: "Technology", size: "10,000+ employees", hq: job.location },
    reviews: { ...g.reviews, quote: swap(g.reviews.quote) },
  };
}

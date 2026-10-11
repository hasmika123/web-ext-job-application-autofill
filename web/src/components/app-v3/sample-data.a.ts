/**
 * SAMPLE — board data, not from the API; replace when the feature ships.
 *
 * App v3, phase V3-A: Dashboard + Job Search (APP-V3-SPEC sections 2.1 and 2.2). Real data (name,
 * applications, resumes, Pro matches, profile) is merged over this in the pages; when a real list is
 * empty the sample rows render so the page looks like the board. QA merges the per-phase
 * `sample-data.<phase>.ts` files into one `sample-data.ts`.
 */
import type { SampleJob, WorkMode } from "@/components/app-v2/sample-data";
import type { Tone } from "@/components/app-v2/common";

/* ── Dashboard (2.1) ─────────────────────────────────────────────────────────────────────── */

export interface DashStat {
  id: "applications" | "interviews" | "offers" | "saved";
  value: string;
  label: string;
  note: string;
  tone: Tone;
}

export const DASH_STATS: DashStat[] = [
  { id: "applications", value: "42", label: "Applications", note: "+12% this week", tone: "blue" },
  { id: "interviews", value: "8", label: "Interviews", note: "2 this week", tone: "green" },
  { id: "offers", value: "5", label: "Offers", note: "1 new", tone: "violet" },
  { id: "saved", value: "18", label: "Saved Jobs", note: "+6 this week", tone: "amber" },
];

/** Application Activity: Applied / Interviews / Offers per bucket (Last 30 days). */
export const DASH_ACTIVITY: { label: string; values: number[] }[] = [
  { label: "Sep 10", values: [18, 6, 2] },
  { label: "Sep 17", values: [22, 7, 3] },
  { label: "Sep 24", values: [15, 5, 1] },
  { label: "Oct 1", values: [26, 9, 4] },
  { label: "Oct 8", values: [30, 10, 5] },
];

/**
 * Application Activity per period. 30 days is the board; the 7 and 90 day sets are sample values in
 * the same shape so the period select has something to switch to.
 */
export const DASH_ACTIVITY_PERIODS: Record<string, { label: string; values: number[] }[]> = {
  "Last 7 days": [
    { label: "Oct 4", values: [4, 1, 0] },
    { label: "Oct 5", values: [6, 2, 1] },
    { label: "Oct 6", values: [3, 1, 0] },
    { label: "Oct 7", values: [7, 2, 1] },
    { label: "Oct 8", values: [9, 3, 1] },
  ],
  "Last 30 days": DASH_ACTIVITY,
  "Last 90 days": [
    { label: "Jul 20", values: [42, 12, 4] },
    { label: "Aug 15", values: [55, 17, 6] },
    { label: "Sep 10", values: [48, 15, 5] },
    { label: "Sep 24", values: [63, 21, 8] },
    { label: "Oct 8", values: [71, 24, 9] },
  ],
};

export const DASH_STATUS: { label: string; value: number; tone: Tone }[] = [
  { label: "Applied", value: 18, tone: "blue" },
  { label: "Under Review", value: 10, tone: "amber" },
  { label: "Interview", value: 8, tone: "green" },
  { label: "Offer", value: 5, tone: "violet" },
  { label: "Rejected", value: 1, tone: "coral" },
];

export const DASH_INSIGHTS: { text: string; href: string }[] = [
  { text: "You have 3 upcoming interviews. Prepare with AI.", href: "/interview-prep" },
  { text: "Your resume is a strong match (85%+) for 5 similar roles.", href: "/resume-builder" },
  { text: "Try applying to 8 more high-match jobs this week.", href: "/jobs" },
];

export interface DashRecent {
  id: string;
  title: string;
  company: string;
  status: string;
  /** Short date, "Oct 8". */
  date: string;
}

export const DASH_RECENT: DashRecent[] = [
  { id: "s0", title: "Software Engineer", company: "Google", status: "Interview", date: "Oct 8" },
  { id: "s1", title: "Frontend Developer", company: "Microsoft", status: "Under Review", date: "Oct 6" },
  { id: "s2", title: "Software Engineer", company: "Airbnb", status: "Applied", date: "Oct 4" },
  { id: "s3", title: "SDE II", company: "Amazon", status: "Applied", date: "Oct 3" },
  { id: "s4", title: "Frontend Engineer", company: "Meta", status: "Rejected", date: "Oct 1" },
];

/** Recommended for You: sample rows (id = a V3_JOBS id, so the row opens its panel in Job Search). */
export const DASH_RECOMMENDED: { id: string; title: string; company: string; score: number }[] = [
  { id: "google-swe", title: "Software Engineer", company: "Google", score: 95 },
  { id: "airbnb-fe", title: "Frontend Developer", company: "Airbnb", score: 88 },
  { id: "amazon-sde2", title: "SDE II", company: "Amazon", score: 86 },
];

export const DASH_PROFILE_CHECKS: { id: string; label: string; done: boolean }[] = [
  { id: "resume", label: "Resume uploaded", done: true },
  { id: "skills", label: "Skills added", done: true },
  { id: "experience", label: "Work experience added", done: true },
  { id: "portfolio", label: "Add portfolio or projects", done: false },
  { id: "titles", label: "Add target job titles", done: false },
  { id: "location", label: "Add location preference", done: false },
];
export const DASH_PROFILE_PCT = 78;

export const DASH_INTERVIEWS: { company: string; title: string; when: string }[] = [
  { company: "Google", title: "Software Engineer", when: "Oct 10, 10:00 AM" },
  { company: "Microsoft", title: "Frontend Developer", when: "Oct 14, 2:00 PM" },
];

export const DASH_ALERTS: { title: string; count: number; ago: string }[] = [
  { title: "Python Developer", count: 3, ago: "2h ago" },
  { title: "Frontend Engineer (Remote)", count: 5, ago: "5h ago" },
  { title: "Software Engineer", count: 12, ago: "Yesterday" },
];

/* ── Job Search (2.2) ────────────────────────────────────────────────────────────────────── */

export type JobType = "Full-time" | "Part-time" | "Contract" | "Internship";
export type JobLevel = "Entry" | "Mid" | "Senior" | "Lead";

/** A job as Job Search draws it: the v2 SampleJob plus the fields the filter rail works on. */
export interface V3Job extends SampleJob {
  type: JobType | null;
  level: JobLevel | null;
  /** "$140K–$200K"; null when a real posting doesn't say. */
  salary: string | null;
  /** Annual, in $k, for the salary slider (null = unknown). */
  salaryMax: number | null;
  /** Days since posted, for sorting. */
  ageDays: number;
}

type Row = [
  id: string,
  title: string,
  company: string,
  location: string,
  mode: WorkMode,
  type: JobType,
  level: JobLevel,
  minK: number,
  maxK: number,
  tags: string[],
  score: number,
  ageDays: number,
];

// Board order first (the five spec rows), then the pool that fills pages 2-5 and the filters.
// 25 full-time rows so the default (Full-time ticked) view paginates 1-5.
const ROWS: Row[] = [
  ["google-swe", "Software Engineer", "Google", "Mountain View, CA", "Remote", "Full-time", "Mid", 140, 200, ["React", "TypeScript", "Next.js"], 95, 2],
  ["ms-fe", "Frontend Developer", "Microsoft", "Seattle, WA", "Hybrid", "Full-time", "Mid", 120, 170, ["React", "TypeScript", "Tailwind"], 88, 3],
  ["airbnb-swe", "Software Engineer", "Airbnb", "Remote", "Remote", "Full-time", "Mid", 135, 190, ["React", "Node.js", "GraphQL"], 86, 3],
  ["amazon-sde2", "SDE II", "Amazon", "Seattle, WA", "On-site", "Full-time", "Mid", 130, 185, ["Java", "AWS", "Distributed Systems"], 86, 2],
  ["meta-fe", "Frontend Engineer", "Meta", "Remote", "Remote", "Full-time", "Senior", 150, 210, ["React", "JavaScript", "GraphQL"], 84, 7],
  ["airbnb-fe", "Frontend Developer", "Airbnb", "San Francisco, CA", "Hybrid", "Full-time", "Mid", 125, 175, ["React", "TypeScript", "CSS"], 88, 4],
  ["netflix-fs", "Full Stack Engineer", "Netflix", "Los Gatos, CA", "Hybrid", "Full-time", "Senior", 150, 210, ["Node.js", "React", "AWS"], 83, 7],
  ["stripe-pe", "Product Engineer", "Stripe", "San Francisco, CA", "Hybrid", "Full-time", "Mid", 130, 180, ["React", "Node.js", "System Design"], 82, 7],
  ["uber-swe", "Software Engineer", "Uber", "San Francisco, CA", "On-site", "Full-time", "Mid", 135, 185, ["Go", "Java", "Kubernetes"], 81, 10],
  ["shopify-fe", "Frontend Developer", "Shopify", "Remote", "Remote", "Full-time", "Mid", 110, 150, ["React", "GraphQL", "Ruby"], 80, 10],
  ["tesla-swe", "Software Engineer", "Tesla", "Palo Alto, CA", "On-site", "Full-time", "Mid", 125, 170, ["C++", "Python", "Embedded"], 79, 12],
  ["stripe-be", "Backend Engineer", "Stripe", "Remote", "Remote", "Full-time", "Senior", 160, 220, ["Java", "Kafka", "AWS"], 78, 14],
  ["airbnb-de", "Data Engineer", "Airbnb", "Remote", "Remote", "Full-time", "Mid", 130, 175, ["Python", "Spark", "SQL"], 77, 14],
  ["apple-ui", "UI Engineer", "Apple", "Cupertino, CA", "Hybrid", "Full-time", "Lead", 170, 240, ["Swift", "TypeScript", "Design Systems"], 76, 15],
  ["netflix-fe", "Frontend Engineer", "Netflix", "Remote", "Remote", "Full-time", "Senior", 160, 230, ["React", "TypeScript", "Performance"], 76, 16],
  ["amazon-sde1", "SDE I", "Amazon", "Austin, TX", "On-site", "Full-time", "Entry", 105, 135, ["Java", "AWS", "DynamoDB"], 75, 18],
  ["uber-plat", "Platform Engineer", "Uber", "Remote", "Remote", "Full-time", "Lead", 180, 250, ["Kubernetes", "Go", "Terraform"], 74, 18],
  ["ms-swe", "Software Engineer", "Microsoft", "Redmond, WA", "Hybrid", "Full-time", "Senior", 150, 210, ["C#", "Azure", ".NET"], 74, 20],
  ["airbnb-fs", "Full Stack Developer", "Airbnb", "San Francisco, CA", "Hybrid", "Full-time", "Mid", 135, 185, ["React", "Node.js", "MySQL"], 73, 21],
  ["google-ml", "Machine Learning Engineer", "Google", "New York, NY", "Hybrid", "Full-time", "Senior", 170, 250, ["Python", "TensorFlow", "Kubernetes"], 72, 21],
  ["stripe-sfe", "Senior Frontend Engineer", "Stripe", "Remote", "Remote", "Full-time", "Senior", 165, 225, ["React", "TypeScript", "Accessibility"], 72, 22],
  ["meta-swe", "Software Engineer", "Meta", "Menlo Park, CA", "On-site", "Full-time", "Mid", 145, 205, ["React", "Hack", "GraphQL"], 71, 24],
  ["shopify-be", "Backend Developer", "Shopify", "Remote", "Remote", "Full-time", "Mid", 115, 160, ["Ruby", "Rails", "MySQL"], 70, 25],
  ["amazon-fe", "Frontend Engineer", "Amazon", "Seattle, WA", "Hybrid", "Full-time", "Mid", 125, 175, ["React", "TypeScript", "AWS"], 70, 26],
  ["google-fe", "Frontend Engineer", "Google", "Remote", "Remote", "Full-time", "Lead", 175, 245, ["Angular", "TypeScript", "Web Performance"], 69, 28],
  // Not full-time: only visible once Full-time is unticked or another type is ticked.
  ["google-intern", "Software Engineer Intern", "Google", "Mountain View, CA", "Remote", "Internship", "Entry", 96, 144, ["Python", "Algorithms"], 68, 5],
  ["ms-intern", "Software Engineer Intern", "Microsoft", "Redmond, WA", "On-site", "Internship", "Entry", 84, 120, ["C#", "Azure"], 66, 9],
  ["meta-contract", "Software Engineer (Contract)", "Meta", "Menlo Park, CA", "Hybrid", "Contract", "Senior", 100, 140, ["React", "JavaScript"], 65, 13],
  ["shopify-pt", "Software Engineer (Part-time)", "Shopify", "Remote", "Remote", "Part-time", "Mid", 50, 70, ["React", "Ruby"], 64, 17],
];

function postedLabel(ageDays: number): string {
  if (ageDays >= 7) {
    const w = Math.round(ageDays / 7);
    return `${w} week${w === 1 ? "" : "s"} ago`;
  }
  return `${ageDays} days ago`;
}

export const V3_JOBS: V3Job[] = ROWS.map(
  ([id, title, company, location, mode, type, level, minK, maxK, tags, score, ageDays]) => ({
    id,
    title,
    company,
    location,
    mode,
    type,
    level,
    tags,
    score,
    posted: postedLabel(ageDays),
    ageDays,
    salary: `$${minK}K–$${maxK}K`,
    salaryMax: maxK,
  }),
);

/** The board's headline count for the untouched sample list. */
export const JOBS_SAMPLE_TOTAL = 1234;
export const JOBS_PAGE_SIZE = 5;

export const JOB_TYPES: JobType[] = ["Full-time", "Part-time", "Contract", "Internship"];
export const JOB_LEVELS: JobLevel[] = ["Entry", "Mid", "Senior", "Lead"];
export const JOB_COMPANIES = ["Google", "Microsoft", "Amazon", "Meta", "Airbnb"];
export const JOB_SALARY_MAX_K = 300;

/** Detail panel copy (variant 3). Google's is the board's; the rest is generated from the job. */
export interface V3Detail {
  about: string;
  doing: string[];
  requirements: string[];
  benefits: string[];
  company: { blurb: string; industry: string; size: string; hq: string };
  reviews: { rating: string; count: string; quote: string };
}

export const GOOGLE_V3_DETAIL: V3Detail = {
  about:
    "Join Google as a Software Engineer and build products that reach billions of people. You'll own features end to end, from design through launch, alongside engineers who care about quality and craft.",
  doing: [
    "Design, build and ship scalable web features used by millions",
    "Write clean, well-tested code and review teammates' work",
    "Partner with product and design to shape what gets built",
    "Improve performance, reliability and accessibility",
    "Mentor newer engineers and share what you learn",
  ],
  requirements: [
    "3+ years building production web applications",
    "Strong skills in TypeScript, React and modern tooling",
    "Solid grounding in data structures, algorithms and system design",
    "Clear communication and a habit of working in the open",
    "Bachelor's degree in Computer Science or equivalent experience",
  ],
  benefits: [
    "Competitive salary, bonus and equity",
    "Comprehensive health, dental and vision coverage",
    "Flexible, hybrid-friendly work",
    "Learning budget and paid parental leave",
    "On-site meals, wellness and commuter perks",
  ],
  company: {
    blurb: "Organizing the world's information and making it universally accessible and useful.",
    industry: "Technology",
    size: "100,000+ employees",
    hq: "Mountain View, CA",
  },
  reviews: { rating: "4.5", count: "12,480 reviews", quote: "Brilliant colleagues and real ownership. Moves fast for a company this size." },
};

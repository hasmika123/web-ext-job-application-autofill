// PLACEHOLDER — board copy, not verified; replace with real values before version2 is promoted
import type { Family } from "../family";

/** Desktop "Our users get hired at amazing companies" strip (board: landing-v3-desktop). Text wordmarks only. */
export const V3_COMPANIES_LINE = "Our users get hired at amazing companies";
export const V3_COMPANIES_MORE = "and many more…";

export interface V3Company {
  name: string;
  /** Wordmark text as drawn. */
  text: string;
  color: string;
  /** Which hand-styled wordmark `V3Companies` draws. */
  style: "google" | "microsoft" | "amazon" | "stripe" | "meta" | "apple" | "netflix";
}

export const V3_COMPANIES: V3Company[] = [
  { name: "Google", text: "Google", color: "#4285F4", style: "google" },
  { name: "Microsoft", text: "Microsoft", color: "#737373", style: "microsoft" },
  { name: "Amazon", text: "amazon", color: "#161D27", style: "amazon" },
  { name: "Stripe", text: "stripe", color: "#635BFF", style: "stripe" },
  { name: "Meta", text: "Meta", color: "#0A66F2", style: "meta" },
  { name: "Apple", text: "Apple", color: "#111111", style: "apple" },
  { name: "Netflix", text: "NETFLIX", color: "#E50914", style: "netflix" },
];

/** Desktop stats band under the six pillars. */
export interface V3Stat {
  value: string;
  label: string;
}

export const V3_BAND_STATS: V3Stat[] = [
  { value: "1M+", label: "Jobs Aggregated" },
  { value: "200K+", label: "Applications Sent" },
  { value: "75K+", label: "Interviews Scheduled" },
  { value: "68%", label: "Get More Interviews with Kiwiply" },
];

/** "Results that speak for themselves." (mobile board; shown at every width). */
export interface V3Result {
  value: string;
  label: string;
  family: Family;
  icon: "zap" | "rocket" | "chart" | "clock";
}

export const V3_RESULTS: V3Result[] = [
  { value: "100K+", label: "Applications submitted", family: "amber", icon: "zap" },
  { value: "5x", label: "Faster applications", family: "amber", icon: "rocket" },
  { value: "3x", label: "More responses on average", family: "pink", icon: "chart" },
  { value: "90%", label: "Save 10+ hours every week", family: "amber", icon: "clock" },
];

/** "Real stories, real progress." carousel (the board shows the first card and four dots). */
export interface V3Story {
  quote: string;
  name: string;
  role: string;
}

export const V3_STORIES: V3Story[] = [
  {
    quote: "Kiwiply helped me apply to 5x more jobs in way less time. I finally started getting interviews!",
    name: "Priya S.",
    role: "Recent Graduate",
  },
  {
    quote: "The email tracking feature is a game changer. I never miss an update anymore.",
    name: "Jason T.",
    role: "Computer Science Student",
  },
  {
    quote: "I love how it suggests the right jobs and tailors my resume for each one. Super easy to use!",
    name: "Maya K.",
    role: "Marketing Intern",
  },
  {
    quote: "Having every application in one place took the stress out of my job hunt.",
    name: "Rohit A.",
    role: "Career Switcher",
  },
];

/** Phone hero: the row of job-site tiles under the three ticks (lettered tiles, no logo files). */
export interface V3AppTile {
  name: string;
  letter: string;
  /** Draw a brand glyph from `@kiwiply/ui` instead of the letter. */
  icon?: "linkedin";
  /** Tile text colour. */
  color: string;
  /** Tile background. */
  bg: string;
}

export const V3_APP_TILES: V3AppTile[] = [
  { name: "Google", letter: "G", color: "#4285F4", bg: "#FFFFFF" },
  { name: "LinkedIn", letter: "in", icon: "linkedin", color: "#0A66C2", bg: "#FFFFFF" },
  { name: "Indeed", letter: "i", color: "#2557A7", bg: "#FFFFFF" },
  { name: "Glassdoor", letter: "g", color: "#0CAA41", bg: "#FFFFFF" },
  { name: "Workday", letter: "W", color: "#0875E1", bg: "#FFFFFF" },
  { name: "Monster", letter: "M", color: "#FFFFFF", bg: "#6E46AE" },
];

/** Phone mock rows in "One platform for your entire job search". */
export interface V3PhoneJob {
  title: string;
  company: string;
  meta: string;
  ago: string;
}

export const V3_PHONE_JOBS: V3PhoneJob[] = [
  { title: "Software Engineer", company: "Google", meta: "Google · Remote", ago: "2 days ago" },
  { title: "Product Manager", company: "Amazon", meta: "Amazon · Full-time", ago: "3 days ago" },
  { title: "Data Analyst", company: "Microsoft", meta: "Microsoft · Remote", ago: "5 days ago" },
];

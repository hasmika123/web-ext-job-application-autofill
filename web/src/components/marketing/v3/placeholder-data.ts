// PLACEHOLDER (stories, phone-mock rows) — board copy, not verified; replace with real values before version2 is promoted.
// The support strip and value tiles are real: they come from `../partners-data.ts` and `../placeholder-data.ts`.

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

/**
 * Phone hero: the row of job-site tiles under the three ticks (lettered tiles, no logo files).
 * Supported today only: LinkedIn plus the ATS set (see `../partners-data.ts`).
 */
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
  { name: "LinkedIn", letter: "in", icon: "linkedin", color: "#0A66C2", bg: "#FFFFFF" },
  { name: "Workday", letter: "W", color: "#0875E1", bg: "#FFFFFF" },
  { name: "Greenhouse", letter: "g", color: "#24A47F", bg: "#FFFFFF" },
  { name: "Lever", letter: "L", color: "#1F2A5A", bg: "#FFFFFF" },
  { name: "Ashby", letter: "A", color: "#1A1A1A", bg: "#FFFFFF" },
  { name: "Workable", letter: "W", color: "#1E6FF5", bg: "#FFFFFF" },
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

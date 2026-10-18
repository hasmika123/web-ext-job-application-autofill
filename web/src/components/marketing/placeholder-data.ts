// PLACEHOLDER (testimonials only) — board copy, not verified; replace with real quotes before version2 is promoted.
// The value band and footer trust row below are real, honest copy (no invented numbers).
import type { Family } from "./family";

/**
 * Value band under "For Organizations" (board: landing-desktop-full). Four plain statements, no
 * numbers: we do not publish counts or percentages we cannot back up. Also used by `/v3`.
 */
export interface Stat {
  title: string;
  /** Which glyph the tile shows (mapped to an `@kiwiply/ui` icon in `sections/Stats.tsx`). */
  icon: "file" | "check" | "mail" | "shield";
  family: Family;
}

export const STATS: Stat[] = [
  { title: "One profile, every form", icon: "file", family: "amber" },
  { title: "You review, you submit", icon: "check", family: "coral" },
  { title: "Replies tracked from Gmail", icon: "mail", family: "pink" },
  { title: "Your data, deletable any time", icon: "shield", family: "amber" },
];

/** "Real People. Real Opportunities." carousel (board: landing-desktop-full). */
export interface Testimonial {
  quote: string;
  name: string;
  role: string;
}

export const TESTIMONIALS: Testimonial[] = [
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
];

/** The four-up trust row in the footer. */
export interface FooterTrust {
  title: string;
  body: string;
  icon: "shield" | "users" | "globe" | "heart";
}

export const FOOTER_TRUST: FooterTrust[] = [
  { title: "Your data is safe", body: "Security & privacy first", icon: "shield" },
  { title: "Built in the open", body: "In beta, improving weekly", icon: "users" },
  { title: "Works on LinkedIn + major ATS", body: "Workday, Greenhouse, Lever, Ashby, Workable", icon: "globe" },
  { title: "Built for your future", body: "More opportunities. More possibilities.", icon: "heart" },
];

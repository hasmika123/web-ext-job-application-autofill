// PLACEHOLDER — board copy, not verified; replace with real values before version2 is promoted
import type { Family } from "./family";

/** Stats row under "For Organizations" (board: landing-desktop-full). Markup renders whatever is here. */
export interface Stat {
  value: string;
  label: string;
  /** Which glyph the tile shows (mapped to an `@kiwiply/ui` icon in `sections/Stats.tsx`). */
  icon: "zap" | "rocket" | "chart" | "file";
  family: Family;
}

export const STATS: Stat[] = [
  { value: "100K+", label: "Applications submitted", icon: "zap", family: "amber" },
  { value: "5x", label: "Faster applications", icon: "rocket", family: "coral" },
  { value: "3x", label: "More responses on average", icon: "chart", family: "pink" },
  { value: "90%", label: "Save 10+ hours every week", icon: "file", family: "amber" },
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
  { title: "Trusted by 100K+", body: "Job seekers worldwide", icon: "users" },
  { title: "Works on 1,000+ sites", body: "Including Workday, Greenhouse, Lever, Ashby and more", icon: "globe" },
  { title: "Built for your future", body: "More opportunities. More possibilities.", icon: "heart" },
];

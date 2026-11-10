/**
 * Marketing navigation data (landing v2) — single source for the header (desktop dropdowns +
 * mobile sheet) and the footer columns. Spec: web/LANDING-V2-SPEC.md §4.1, §13.3 and the link map
 * in §13.6.
 *
 * Every `/#anchor` here resolves to a section id on the landing page (`#pillars`, `#autofill`,
 * `#inbox`, `#matches`, `#resumes`, `#dashboard`, `#how`, `#individuals`, `#organizations`).
 * Pricing lives on `/pricing` (plans: `#pricing`, services: `#services`). Board items with no page
 * carry `soon: true`: the footer renders them as plain text with a "Soon" chip, never a dead link.
 */

export interface NavLink {
  label: string;
  href: string;
  /** No destination yet: render text + a "Soon" chip instead of a link. */
  soon?: boolean;
}

export interface NavGroup {
  label: string;
  items: NavLink[];
}

/** A top-level header entry: either a dropdown group or a plain link. */
export type NavEntry = ({ kind: "group" } & NavGroup) | ({ kind: "link" } & NavLink);

const INDIVIDUALS: NavLink[] = [
  { label: "Find jobs", href: "/#matches" },
  { label: "Autofill applications", href: "/#autofill" },
  { label: "Track your inbox", href: "/#inbox" },
  { label: "Resumes", href: "/#resumes" },
  { label: "Who it's for", href: "/#individuals" },
  { label: "Pricing", href: "/pricing" },
];

const ORGANIZATIONS: NavLink[] = [
  { label: "Overview", href: "/organizations" },
  { label: "How it works", href: "/organizations#how" },
  { label: "Consultancy plan", href: "/pricing" },
  { label: "Talk to us", href: "/contact?topic=organization" },
];

const RESOURCES: NavLink[] = [
  { label: "About", href: "/about" },
  { label: "Contact", href: "/contact" },
  { label: "Expert services", href: "/pricing#services" },
  { label: "Privacy", href: "/privacy" },
  { label: "Terms", href: "/terms" },
];

export const NAV: NavEntry[] = [
  { kind: "group", label: "For Individuals", items: INDIVIDUALS },
  { kind: "group", label: "For Organizations", items: ORGANIZATIONS },
  { kind: "link", label: "Pricing", href: "/pricing" },
  { kind: "group", label: "Resources", items: RESOURCES },
];

/**
 * Which top-level header entry is active for a pathname. "For Individuals" lives on `/` anchors
 * only (hash is not tracked), so it is never active.
 */
export function isNavActive(label: string, pathname: string | null): boolean {
  if (!pathname) return false;
  const is = (p: string) => pathname === p || pathname.startsWith(p + "/");
  switch (label) {
    case "Pricing":
      return is("/pricing");
    case "For Organizations":
      return pathname === "/organizations" || pathname.startsWith("/org");
    case "Resources":
      return ["/about", "/contact", "/privacy", "/terms"].some(is);
    default:
      return false;
  }
}

/** Footer link columns, exactly as on the board (spec §13.3), destinations per §13.6. */
export const FOOTER_COLUMNS: NavGroup[] = [
  {
    label: "For Individuals",
    items: [
      { label: "How It Works", href: "/#how" },
      { label: "Find Jobs", href: "/#matches" },
      { label: "AI Application Copilot", href: "/#pillars" },
      { label: "Resume Builder", href: "/#resumes" },
      { label: "Interview Prep", href: "/#how" },
      { label: "Application Tracker", href: "/dashboard" },
      { label: "Browser Extension", href: "/signup" },
      { label: "Pricing", href: "/pricing" },
      { label: "Sign Up", href: "/signup" },
    ],
  },
  {
    label: "For Organizations",
    items: [
      { label: "Overview", href: "/organizations" },
      { label: "Team Management", href: "/organizations#features" },
      { label: "Scheduled Applications", href: "/organizations#features" },
      { label: "Reports & Analytics", href: "/organizations#features" },
      { label: "Recruiter Manager Tools", href: "/organizations#features" },
      { label: "Roles & Permissions", href: "/organizations#features" },
      { label: "Enterprise Security", href: "/organizations#features" },
      { label: "Pricing", href: "/pricing" },
      { label: "Request a Demo", href: "/contact?topic=organization" },
    ],
  },
  {
    label: "Resources",
    items: [
      { label: "Blog", href: "#", soon: true },
      { label: "Career Guides", href: "#", soon: true },
      { label: "Resume Examples", href: "#", soon: true },
      { label: "Interview Questions", href: "#", soon: true },
      { label: "Company Reviews", href: "#", soon: true },
      { label: "Job Search Tips", href: "#", soon: true },
      { label: "Browser Extension Help", href: "/signup" },
      { label: "API", href: "#", soon: true },
    ],
  },
  {
    label: "Company",
    items: [
      { label: "About Us", href: "/about" },
      { label: "Our Mission", href: "/about#mission" },
      { label: "Careers", href: "/contact" },
      { label: "Press", href: "/contact" },
      { label: "Contact Us", href: "/contact" },
      { label: "Security", href: "/privacy" },
      { label: "Privacy", href: "/privacy" },
      { label: "Terms", href: "/terms" },
      { label: "Status", href: "/contact" },
    ],
  },
];

export interface SocialLink {
  label: string;
  /** Short lettering shown in the round tile. */
  short: string;
  href: string;
}

/** Social profiles shown as lettered round tiles. `#` until the real accounts exist. */
export const SOCIAL_LINKS: SocialLink[] = [
  { label: "X", short: "X", href: "#" },
  { label: "LinkedIn", short: "in", href: "#" },
  { label: "Instagram", short: "Ig", href: "#" },
  { label: "YouTube", short: "Yt", href: "#" },
  { label: "TikTok", short: "Tk", href: "#" },
];

/** Browsers the extension runs in, shown as lettered square tiles (not links). */
export const BROWSER_TILES: { label: string; short: string; color: string }[] = [
  { label: "Chrome", short: "C", color: "#4285F4" },
  { label: "Edge", short: "E", color: "#0F9D8A" },
  { label: "Firefox", short: "F", color: "#FF7139" },
  { label: "Brave", short: "B", color: "#FB542B" },
  { label: "Opera", short: "O", color: "#FF1B2D" },
  { label: "Safari", short: "S", color: "#1E90FF" },
];

/** Bottom-row legal links, in board order (spec §13.3 / §13.6). */
export const FOOTER_LEGAL: NavLink[] = [
  { label: "Privacy", href: "/privacy" },
  { label: "Terms", href: "/terms" },
  { label: "Cookies", href: "/privacy#cookies" },
  { label: "Accessibility", href: "/contact" },
  { label: "Sitemap", href: "/sitemap.xml" },
  { label: "Do Not Sell or Share My Personal Information", href: "/privacy" },
];

/** Header CTA targets. */
export const LOGIN_HREF = "/login";
export const SIGNUP_HREF = "/signup";

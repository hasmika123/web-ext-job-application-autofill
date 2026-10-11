/**
 * Marketing navigation data (landing v2) — single source for the header (desktop dropdowns +
 * mobile sheet) and the footer columns. Spec: web/LANDING-V2-SPEC.md §4.1.
 *
 * Every `/#anchor` here must resolve to a section id on the landing page once V2.3 lands.
 * Only link to pages that exist: no Blog / Careers / Press / Help Center.
 */

export interface NavLink {
  label: string;
  href: string;
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
  { label: "Pricing", href: "/#pricing" },
];

const ORGANIZATIONS: NavLink[] = [
  { label: "Overview", href: "/organizations" },
  { label: "How it works", href: "/organizations#how" },
  { label: "Consultancy plan", href: "/#pricing" },
  { label: "Talk to us", href: "/contact?topic=organization" },
];

const RESOURCES: NavLink[] = [
  { label: "About", href: "/about" },
  { label: "Contact", href: "/contact" },
  { label: "Expert services", href: "/#services" },
  { label: "Privacy", href: "/privacy" },
  { label: "Terms", href: "/terms" },
];

export const NAV: NavEntry[] = [
  { kind: "group", label: "For Individuals", items: INDIVIDUALS },
  { kind: "group", label: "For Organizations", items: ORGANIZATIONS },
  { kind: "link", label: "Pricing", href: "/#pricing" },
  { kind: "group", label: "Resources", items: RESOURCES },
];

/** Footer link columns, in display order. */
export const FOOTER_COLUMNS: NavGroup[] = [
  { label: "For Individuals", items: INDIVIDUALS },
  { label: "For Organizations", items: ORGANIZATIONS },
  {
    label: "Resources",
    items: [
      { label: "Pricing", href: "/#pricing" },
      { label: "Expert services", href: "/#services" },
      { label: "Product updates", href: "#newsletter" },
    ],
  },
  {
    label: "Company",
    items: [
      { label: "About", href: "/about" },
      { label: "Contact", href: "/contact" },
      { label: "Privacy", href: "/privacy" },
      { label: "Terms", href: "/terms" },
    ],
  },
];

export interface SocialLink {
  label: string;
  href: string;
}

/**
 * Social profiles. Empty on purpose: the footer renders nothing for an empty list, and we
 * don't link accounts that don't exist. Add real ones here when they do.
 */
export const SOCIAL_LINKS: SocialLink[] = [];

/** Header CTA targets. */
export const LOGIN_HREF = "/login";
export const SIGNUP_HREF = "/signup";

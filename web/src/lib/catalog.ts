import { PRICE_3MO, PRICE_MONTHLY } from "@/lib/prices";

/**
 * What Kiwiply sells, as shown in the landing page's Pricing and Services sections.
 *
 * Free and Pro are sold by checkout. Everything else is real and fully described — scope, limits
 * and price — but sold through "Contact us" until its checkout is switched on. Cards show a few
 * short highlights; the full breakdown lives in each offer's pop-up, so the cards never crowd.
 * Numbers come from ROADMAP → Expansion build (Phases 18–23); Phase 18 moves them into the
 * database catalog, and this file goes away then.
 *
 * `topic` keys must match `SalesInquiryService.TOPICS` in the API — which is why the Consultancy
 * plan still travels as `organization` and Marketer seats as `consultancy`. Only the labels changed.
 */

export type InquiryTopic =
  | "autopilot"
  | "organization"
  | "consultancy"
  | "consultancy-ops"
  | "resume-review"
  | "resume-rewrite"
  | "mock-interview"
  | "coaching"
  | "other";

/** Labels for the contact form's topic picker, in display order. */
export const TOPIC_LABELS: Record<InquiryTopic, string> = {
  autopilot: "Autopilot",
  organization: "Consultancy plan",
  consultancy: "Marketer seats (consultancy add-on)",
  "consultancy-ops": "Consultancy Ops (add-on)",
  "resume-review": "Expert resume review",
  "resume-rewrite": "Professional resume rewrite",
  "mock-interview": "Live mock interview",
  coaching: "Career coaching",
  other: "Something else",
};

/** Topics where the form asks for a company and team size. */
export const ORG_TOPICS: InquiryTopic[] = ["organization", "consultancy", "consultancy-ops"];

export function isTopic(s: string | undefined | null): s is InquiryTopic {
  return s != null && Object.prototype.hasOwnProperty.call(TOPIC_LABELS, s);
}

export function contactHref(topic: InquiryTopic): string {
  return `/contact?topic=${topic}`;
}

/** One group of lines in an offer's pop-up. Lines stay short: a phrase, not a sentence. */
export type DetailGroup = { heading: string; items: string[] };

export type Offer = {
  /** Stable id, for keys and dialogs. */
  id: string;
  /** Who it's for, in a few words — the card's top line. */
  eyebrow: string;
  name: string;
  /** One line under the name. */
  tagline: string;
  price: string;
  /** Unit after the price, e.g. "/month". */
  unit?: string;
  /** One line under the price: the other billing option, or what the price covers. */
  priceNote?: string;
  /** What the card shows — 3 or 4 short lines. Everything else is in `details`. */
  highlights: string[];
  /** The pop-up's breakdown. */
  details: DetailGroup[];
  /** The caps that keep a plan honest — shown so nobody is surprised. */
  limits?: string[];
  badge?: string;
  /** Set for offers sold through "Contact us". */
  topic?: InquiryTopic;
};

// ---- Plans ------------------------------------------------------------------------------------

export const FREE: Offer = {
  id: "free",
  eyebrow: "To get started",
  name: "Free",
  tagline: "Everything you need to apply.",
  price: "$0",
  priceNote: "Free forever",
  highlights: ["Autofill on top job sites", "Applications tracked for you", "AI resume parsing", "3 saved resumes"],
  details: [
    {
      heading: "Apply",
      items: ["Autofill on Workday, Greenhouse, Lever, Ashby and more", "Review every field before it fills", "Nothing is ever submitted for you"],
    },
    { heading: "Track", items: ["Every application logged as you apply", "One board for your whole search"] },
    { heading: "Resumes", items: ["AI reads your resume into your profile", "Up to 3 saved resumes"] },
    { heading: "AI", items: ["Use your own AI key for drafting"] },
  ],
};

export const PRO: Offer = {
  id: "pro",
  eyebrow: "For your search",
  name: "Pro",
  tagline: "Kiwiply AI does the heavy lifting.",
  price: PRICE_MONTHLY,
  unit: "/month",
  priceNote: `or ${PRICE_3MO} every 3 months`,
  badge: "Most popular",
  highlights: ["Everything in Free", "Kiwiply AI — no key needed", "Best resume for each job", "Inbox updates your board"],
  details: [
    {
      heading: "Kiwiply AI",
      items: ["Drafts answers to open questions", "Picks your best resume for each job", "Job-fit report: match, gaps, red flags", "ATS score with what to fix first", "Tailors a resume to the job"],
    },
    { heading: "Tracking", items: ["Connect a Gmail — replies update your board", "Daily job matches"] },
    { heading: "Resumes and sync", items: ["Up to 25 saved resumes", "Answers synced across your devices"] },
  ],
  limits: ["A fair-use AI allowance each billing period"],
};

export const AUTOPILOT: Offer = {
  id: "autopilot",
  topic: "autopilot",
  eyebrow: "For an active search",
  name: "Autopilot",
  tagline: "Pick jobs. Kiwiply prepares them. You submit.",
  price: "$39.99",
  unit: "/month",
  priceNote: "or $99.99 every 3 months",
  highlights: ["Everything in Pro", "Prepares applications in bulk", "You review and submit", "AI interview practice"],
  details: [
    {
      heading: "Bulk prepare",
      items: ["Choose jobs from matches, saved jobs or your board", "Each one filled in its own window", "Stops at the final review page", "One ready-to-submit queue"],
    },
    { heading: "When it needs you", items: ["Sign-ins, CAPTCHAs and unusual questions are flagged"] },
    { heading: "Also included", items: ["AI interview practice with feedback", "Up to 50 saved resumes", "A larger AI allowance"] },
  ],
  limits: ["300 prepared applications a month, 30 a day", "You submit every application yourself"],
};

export const CONSULTANCY: Offer = {
  id: "consultancy",
  topic: "organization",
  eyebrow: "For staffing & IT consultancies",
  name: "Consultancy",
  tagline: "Kiwiply for your whole bench.",
  price: "$499",
  unit: " setup",
  priceNote: "then from $24.99 per person / month",
  highlights: ["A plan per consultant", "Admin console and reports", "One monthly invoice", "Marketer and Ops add-ons"],
  // Grouped by who gets what, so a buyer can see what each side of their team can do.
  details: [
    { heading: "Your consultants", items: ["Their own Pro or Autopilot plan", "Autofill, tracking and AI on every job", "Keep their account if they leave"] },
    { heading: "Your admins", items: ["Invite the team by CSV", "Assign or change plans any time", "Progress reports, with consent"] },
    { heading: "Billing", items: ["One monthly invoice", "Card or bank transfer", "Pay by the day when adding mid-month"] },
    { heading: "Setup ($499, once)", items: ["Workspace and admin accounts", "Bulk invite", "An onboarding call"] },
  ],
};

/** How the Consultancy plan works, in three steps — the pop-up's first read. */
export const CONSULTANCY_STEPS: { title: string; body: string }[] = [
  { title: "We set you up", body: "Workspace, admins and invites — one $499 fee." },
  { title: "Pick a plan per person", body: "Pay monthly only for who you assign." },
  { title: "Add help if you need it", body: "Marketers to prep, Ops to track hours and money." },
];

/** Consultancy: what each person costs and gets, chosen per person. */
export const PER_PERSON: { item: string; what: string; price: string; note: string }[] = [
  { item: "Pro", what: "AI resume fit, tailoring, inbox tracking", price: "$24.99", note: "/ person / month" },
  { item: "Autopilot", what: "Pro + bulk-prepared applications", price: "$49.99", note: "/ person / month" },
  { item: "AI interview practice", what: "Practice interviews with feedback", price: "$9.99", note: "/ person / month" },
  { item: "Expert services", what: "Resume review, rewrite, mock interviews, coaching", price: "Standard prices", note: "per order" },
];

export const PLANS: Offer[] = [FREE, PRO, AUTOPILOT, CONSULTANCY];

/** The "Compare plans" table. A string is shown as-is; true is a check, false a dash. */
export const COMPARE: { feature: string; free: string | boolean; pro: string | boolean; autopilot: string | boolean }[] = [
  { feature: "Price", free: "$0", pro: `${PRICE_MONTHLY}/mo`, autopilot: "$39.99/mo" },
  { feature: "Autofill on job sites", free: true, pro: true, autopilot: true },
  { feature: "You review every field", free: true, pro: true, autopilot: true },
  { feature: "Application tracker", free: true, pro: true, autopilot: true },
  { feature: "AI resume parsing", free: true, pro: true, autopilot: true },
  { feature: "Saved resumes", free: "3", pro: "25", autopilot: "50" },
  { feature: "AI drafting", free: "Your own key", pro: "Kiwiply AI", autopilot: "Kiwiply AI" },
  { feature: "Best resume per job + job fit", free: false, pro: true, autopilot: true },
  { feature: "ATS score + tailoring", free: false, pro: true, autopilot: true },
  { feature: "Inbox updates your board", free: false, pro: true, autopilot: true },
  { feature: "Daily job matches", free: false, pro: true, autopilot: true },
  { feature: "Answers synced across devices", free: false, pro: true, autopilot: true },
  { feature: "Bulk-prepared applications", free: false, pro: false, autopilot: "300 / month" },
  { feature: "AI interview practice", free: false, pro: false, autopilot: true },
];

// ---- Services -----------------------------------------------------------------------------------

export const EXPERT_SERVICES: Offer[] = [
  {
    id: "resume-review",
    topic: "resume-review",
    eyebrow: "Written feedback",
    name: "Resume review",
    tagline: "An expert reads it against your target jobs.",
    price: "$79",
    priceNote: "one-time",
    highlights: ["Feedback within 48 hours", "Checked against your target roles", "A fix-first list"],
    details: [{ heading: "You get", items: ["Written feedback within 48 hours", "Checked against the roles you want", "A clear list of what to fix first"] }],
  },
  {
    id: "resume-rewrite",
    topic: "resume-rewrite",
    eyebrow: "Done for you",
    name: "Resume rewrite",
    tagline: "A pro writer rewrites it for your target role.",
    price: "$199",
    priceNote: "one-time",
    highlights: ["A full rewrite", "One round of revisions", "Saved to your resumes"],
    details: [{ heading: "You get", items: ["A full rewrite, tailored to your target role", "One round of revisions included", "Saved straight into your Kiwiply resumes"] }],
  },
  {
    id: "mock-interview",
    topic: "mock-interview",
    eyebrow: "45 minutes, live",
    name: "Mock interview",
    tagline: "Practice with a real interviewer.",
    price: "$129",
    priceNote: "per session",
    highlights: ["Built on a real job post", "Feedback on every answer", "A written summary"],
    details: [{ heading: "You get", items: ["Shaped around a real job description", "Honest feedback on every answer", "A written summary afterwards"] }],
  },
  {
    id: "coaching",
    topic: "coaching",
    eyebrow: "60 minutes, live",
    name: "Career coaching",
    tagline: "One-on-one time with a career coach.",
    price: "$119",
    priceNote: "per session",
    highlights: ["Search strategy", "Offers and negotiation", "Notes and next steps"],
    details: [{ heading: "You get", items: ["Search strategy and positioning", "Help with offers and negotiation", "Notes and next steps afterwards"] }],
  },
];

/** Optional add-ons to the Consultancy plan, shown inside its pop-up. */
export const CONSULTANCY_ADDONS: Offer[] = [
  {
    id: "marketer-seats",
    topic: "consultancy",
    eyebrow: "Add-on · subscription",
    name: "Marketer seats",
    tagline: "Marketers do the prep. Consultants approve and submit.",
    price: "$29.99",
    unit: "/marketer/month",
    highlights: [
      "Builds and tailors resumes for each consultant",
      "Assigns jobs, each with the right resume",
      "Sees each consultant's board, with consent",
      "Recruiter mail lands on the right board",
    ],
    details: [],
    limits: ["Up to 10 consultants per marketer and 100 open jobs each", "Each consultant needs a Pro or Autopilot seat"],
  },
  {
    id: "consultancy-ops",
    topic: "consultancy-ops",
    eyebrow: "Add-on · custom",
    name: "Consultancy Ops",
    tagline: "Timesheets and placement money, in one place.",
    price: "Custom",
    unit: " pricing",
    highlights: ["Weekly timesheets and approvals", "Client invoices from approved hours", "Bill rate, pay rate and expenses", "Profit by client, consultant and month"],
    details: [],
    limits: ["Record-keeping only — we never move money or run payroll", "We never store bank numbers, SSNs or tax IDs"],
  },
];

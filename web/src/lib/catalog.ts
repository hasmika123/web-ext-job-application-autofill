/**
 * What Kiwiply sells, as shown on /pricing (Phase 15.6).
 *
 * Free and Pro are sold by checkout and live in the pricing page itself, because their buttons
 * depend on the visitor's plan. Everything here is real and fully described — scope, limits and
 * price — but sold through "Contact us" until its checkout is switched on. The numbers come from
 * ROADMAP → Expansion build (Phases 18–23); Phase 18 moves them into the database catalog, and
 * this file goes away then.
 *
 * `topic` keys must match `SalesInquiryService.TOPICS` in the API.
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

export type Offer = {
  topic: InquiryTopic;
  name: string;
  /** Who it's for, in a few words. */
  audience: string;
  price: string;
  /** Unit after the price, e.g. "/month". */
  unit?: string;
  /** One line under the price: alternative billing, or what the price covers. */
  priceNote?: string;
  summary: string;
  features: string[];
  /** The caps that keep a plan honest — shown so nobody is surprised. */
  limits?: string[];
};

/** Labels for the contact form's topic picker, in display order. */
export const TOPIC_LABELS: Record<InquiryTopic, string> = {
  autopilot: "Autopilot",
  organization: "Organization plan",
  consultancy: "Consultancy — Marketer seats",
  "consultancy-ops": "Consultancy Ops add-on",
  "resume-review": "Human resume review",
  "resume-rewrite": "Professional resume rewrite",
  "mock-interview": "Human mock interview",
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

export const AUTOPILOT: Offer = {
  topic: "autopilot",
  name: "Autopilot",
  audience: "For an active job search",
  price: "$39.99",
  unit: "/month",
  priceNote: "or $99.99 every 3 months",
  summary: "Pick the jobs. Kiwiply prepares every application. You review and press Submit.",
  features: [
    "Everything in Pro",
    "Prepare applications in bulk — choose jobs from your matches, saved jobs or board",
    "Kiwiply fills each one in a separate window while you do something else",
    "Stops at the final review page — you check it, tick the declaration and submit it yourself",
    "A ready-to-submit queue to go through prepared applications in one place",
    "Anything it can't finish — a sign-in, a CAPTCHA, an unusual question — is flagged “Needs you”",
    "AI interview practice: mock interviews with feedback on every answer",
    "50 saved resumes and a larger AI allowance",
  ],
  limits: ["Up to 300 prepared applications a month, 30 a day", "Nothing is ever submitted for you"],
};

export const ORGANIZATION: Offer = {
  topic: "organization",
  name: "Organization",
  audience: "Companies, schools and outplacement firms",
  price: "$499",
  unit: " one-time setup",
  priceNote: "then per person, per month — only for what each person gets",
  summary: "Give your people Kiwiply, and choose exactly what each person gets.",
  features: [
    "Mix and match per person — Pro for one, Autopilot for another, a service for a third",
    "Admin console: invite people by CSV, assign and reassign, see invoices",
    "Summary reports — who has started, applications prepared and submitted (with each person's consent)",
    "One monthly invoice, by card or bank transfer",
    "Add someone mid-month and pay only for the days left; removing someone takes effect at the end of the month",
    "Everyone keeps their own account and data if they leave",
    "Setup covers your workspace, admin accounts, bulk invite and an onboarding call",
  ],
};

/** The per-person menu for organizations. */
export const ORG_PER_PERSON: { item: string; price: string; note: string }[] = [
  { item: "Pro", price: "$24.99", note: "per person / month" },
  { item: "Autopilot", price: "$49.99", note: "per person / month" },
  { item: "AI interview practice", price: "$9.99", note: "per person / month" },
  { item: "Human services", price: "Standard prices", note: "per order — see Services below" },
];

export const CONSULTANCY: Offer = {
  topic: "consultancy",
  name: "Consultancy",
  audience: "Staffing and IT consultancies",
  price: "$29.99",
  unit: "/marketer/month",
  priceNote: "on top of the Organization plan",
  summary: "Your marketers do the legwork for their consultants. Consultants just review and submit.",
  features: [
    "Everything in Organization",
    "Marketer seats: each marketer looks after their own group of consultants",
    "See each consultant's dashboard, board and applications — with their consent",
    "Build and tailor resumes for consultants; each consultant approves a resume once before it's used",
    "Job bank: assign a batch of jobs to a consultant, each with the right resume",
    "Consultants run Autopilot on their assigned jobs, or open each one on Pro",
    "Recruiter emails to the marketer's inbox update the right consultant's board",
    "Consultants always review and submit every application themselves",
  ],
  limits: [
    "Up to 10 consultants per marketer",
    "Up to 100 open assigned jobs per consultant",
    "Each consultant a marketer manages needs at least a Pro seat",
  ],
};

export const CONSULTANCY_OPS: Offer = {
  topic: "consultancy-ops",
  name: "Consultancy Ops",
  audience: "Optional add-on for consultancies",
  price: "Custom",
  priceNote: "priced to your team — talk to us",
  summary: "Timesheets and the money around every placement, in the same place as the job search.",
  features: [
    "Weekly timesheets, submitted by consultants and approved by your team",
    "Placements with bill rate (what the client pays) and pay rate (what the consultant gets)",
    "Client invoices built from approved hours",
    "Payments received, payments made and expenses, all recorded",
    "Profit by consultant, by client and by month",
    "Export everything to CSV or PDF",
  ],
  limits: [
    "Record-keeping only — we never move money or run payroll",
    "We never store bank account numbers, SSNs or tax IDs",
  ],
};

export const SERVICES: Offer[] = [
  {
    topic: "resume-review",
    name: "Human resume review",
    audience: "Written feedback",
    price: "$79",
    summary: "An experienced reviewer reads your resume against the jobs you want.",
    features: ["Written feedback within 48 hours", "Checked against the roles you're targeting", "A clear list of what to fix first"],
  },
  {
    topic: "resume-rewrite",
    name: "Professional resume rewrite",
    audience: "Done for you",
    price: "$199",
    summary: "A professional writer rewrites your resume for the role you're going after.",
    features: ["A full rewrite, tailored to your target role", "One round of revisions included", "Saved straight into your Kiwiply resumes"],
  },
  {
    topic: "mock-interview",
    name: "Human mock interview",
    audience: "45 minutes, live",
    price: "$129",
    summary: "A live practice interview with an experienced interviewer.",
    features: ["Shaped around a real job description", "Honest feedback on every answer", "A written summary afterwards"],
  },
  {
    topic: "coaching",
    name: "Career coaching",
    audience: "60 minutes, live",
    price: "$119",
    summary: "One-to-one time with a career coach.",
    features: ["Search strategy and positioning", "Offers and negotiation", "Notes and next steps afterwards"],
  },
];

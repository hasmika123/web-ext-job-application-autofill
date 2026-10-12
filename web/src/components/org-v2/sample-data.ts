// SAMPLE — board data, not from the API; replace when the feature ships
//
// Every row/number for the enterprise admin pages (APP-V2-SPEC §6.1 Applications, §6.2 Integrations,
// §6.3 Billing, §6.4 Settings, §6.5 Interviews, §6.6 Analytics, §6.7 AI Resume Support, §6.8 Job
// Opportunities, §6.9 Dashboard + Team). No org model exists in the API yet, so all of
// this renders as-is. The signed-in user's real name replaces "Priya Nair" ONLY in the top bar.
import type { Tone } from "@/components/app-v2/common";

export interface Delta {
  value: string;
  up: boolean;
}

/** Sparkline shapes for the stat tiles (rising lines like the board). */
export const SPARK = {
  a: [4, 5, 4, 6, 8, 7, 9, 12],
  b: [3, 4, 3, 5, 4, 6, 7, 9],
  c: [2, 4, 3, 5, 4, 7, 6, 9],
  d: [2, 3, 3, 5, 6, 5, 8, 9],
} as const;

/* ── Shared: stages ─────────────────────────────────────────────────────────────── */
export type Stage = "Applied" | "In Review" | "Interviewing" | "Offer" | "Rejected";

export const STAGE_TONE: Record<Stage, Tone> = {
  Interviewing: "blue",
  Applied: "blue",
  Offer: "amber",
  "In Review": "violet",
  Rejected: "coral",
};

/* ── §6.1 Applications ──────────────────────────────────────────────────────────── */
export interface ApplicationRow {
  id: string;
  name: string;
  /** Subtitle under the employee name. */
  title: string;
  company: string;
  position: string;
  date: string;
  stage: Stage;
  owner: string;
  resume: "Submitted" | "Needs Update";
  nextAction: string;
  nextDate: string;
}

export const APPLICATIONS_STATS = [
  { id: "total", value: "124", label: "Total Applications", delta: { value: "32%", up: true }, tone: "green", spark: SPARK.a },
  { id: "review", value: "48", label: "In Review", delta: { value: "18%", up: true }, tone: "blue", spark: SPARK.b },
  { id: "interviews", value: "32", label: "Interviews", delta: { value: "20%", up: true }, tone: "amber", spark: SPARK.c },
  { id: "offers", value: "18", label: "Offers", delta: { value: "50%", up: true }, tone: "violet", spark: SPARK.d },
] as const;

export const APPLICATION_TABS = [
  { id: "all", label: "All Applications", count: 124 },
  { id: "Applied", label: "Applied", count: 28 },
  { id: "In Review", label: "In Review", count: 48 },
  { id: "Interviewing", label: "Interview", count: 32 },
  { id: "Offer", label: "Offer", count: 18 },
  { id: "Rejected", label: "Rejected", count: 14 },
];

export const APPLICATIONS: ApplicationRow[] = [
  { id: "a1", name: "Aarav Mehta", title: "Product Designer", company: "Google", position: "Product Designer", date: "Oct 8, 2026", stage: "Interviewing", owner: "Priya Nair", resume: "Submitted", nextAction: "Prepare for interview", nextDate: "Oct 12, 2026" },
  { id: "a2", name: "Sneha Patel", title: "Software Engineer", company: "Microsoft", position: "Software Engineer", date: "Oct 6, 2026", stage: "Applied", owner: "Rahul Sharma", resume: "Submitted", nextAction: "Follow up", nextDate: "Oct 14, 2026" },
  { id: "a3", name: "Vikram Reddy", title: "Data Analyst", company: "Amazon", position: "Data Analyst", date: "Oct 5, 2026", stage: "Offer", owner: "Aishwarya K.", resume: "Submitted", nextAction: "Review offer", nextDate: "Oct 7, 2026" },
  { id: "a4", name: "Neha Gupta", title: "Product Manager", company: "Atlassian", position: "Product Manager", date: "Oct 4, 2026", stage: "In Review", owner: "Vikram R.", resume: "Submitted", nextAction: "Check status", nextDate: "Oct 10, 2026" },
  { id: "a5", name: "Daniel Kim", title: "UX Researcher", company: "Meta", position: "UX Researcher", date: "Oct 3, 2026", stage: "Rejected", owner: "Priya Nair", resume: "Submitted", nextAction: "Share feedback", nextDate: "Oct 6, 2026" },
  { id: "a6", name: "Fatima Khan", title: "Marketing Specialist", company: "Spotify", position: "Marketing Specialist", date: "Oct 2, 2026", stage: "Interviewing", owner: "Rahul Sharma", resume: "Needs Update", nextAction: "Send updated resume", nextDate: "Oct 9, 2026" },
  { id: "a7", name: "Rohan Desai", title: "Software Engineer", company: "Stripe", position: "Software Engineer", date: "Oct 1, 2026", stage: "In Review", owner: "Aishwarya K.", resume: "Submitted", nextAction: "Follow up", nextDate: "Oct 8, 2026" },
  { id: "a8", name: "Emily Chen", title: "Data Analyst", company: "Adobe", position: "Data Analyst", date: "Sep 30, 2026", stage: "Applied", owner: "Vikram R.", resume: "Needs Update", nextAction: "Update resume", nextDate: "Oct 5, 2026" },
];

export const STAGE_BREAKDOWN = [
  { label: "Applied", value: 28, pct: 23, tone: "blue" },
  { label: "In Review", value: 48, pct: 39, tone: "green" },
  { label: "Interviewing", value: 32, pct: 26, tone: "amber" },
  { label: "Offer", value: 18, pct: 15, tone: "violet" },
  { label: "Rejected", value: 14, pct: 11, tone: "coral" },
] as const;

export const RECENT_RESPONSES = [
  { id: "r1", company: "Google", title: "Interview Invitation", sub: "Product Designer", ago: "2h ago", isNew: true },
  { id: "r2", company: "Microsoft", title: "Application Received", sub: "Software Engineer", ago: "1d ago", isNew: false },
  { id: "r3", company: "Amazon", title: "Moved to Interview", sub: "Data Analyst", ago: "2d ago", isNew: false },
  { id: "r4", company: "Atlassian", title: "Application Under Review", sub: "Product Manager", ago: "3d ago", isNew: false },
  { id: "r5", company: "Spotify", title: "Rejection Received", sub: "Marketing Specialist", ago: "4d ago", isNew: false },
];

export const FOLLOW_UP_TASKS: { id: string; text: string; date: string; priority: "High" | "Medium" | "Low" }[] = [
  { id: "t1", text: "Send follow-up email to Microsoft", date: "Today", priority: "High" },
  { id: "t2", text: "Check status for Atlassian application", date: "Oct 9, 2026", priority: "Medium" },
  { id: "t3", text: "Help Fatima update resume for Spotify", date: "Oct 9, 2026", priority: "Medium" },
  { id: "t4", text: "Prepare Aarav for Google interview", date: "Oct 12, 2026", priority: "High" },
  { id: "t5", text: "Review Amazon offer with Vikram", date: "Oct 13, 2026", priority: "Low" },
];
export const PRIORITY_TONE: Record<"High" | "Medium" | "Low", Tone> = { High: "coral", Medium: "amber", Low: "green" };

export const TIMELINE: { id: string; title: string; sub: string; when: string; tone: Tone }[] = [
  { id: "tl1", title: "Aarav Mehta moved to Interviewing", sub: "Google – Product Designer", when: "Oct 8, 2026 2:14 PM", tone: "blue" },
  { id: "tl2", title: "Sneha Patel application submitted", sub: "Microsoft – Software Engineer", when: "Oct 8, 2026 11:20 AM", tone: "green" },
  { id: "tl3", title: "Vikram Reddy received an offer", sub: "Amazon – Data Analyst", when: "Oct 7, 2026 4:35 PM", tone: "amber" },
  { id: "tl4", title: "Neha Gupta moved to In Review", sub: "Atlassian – Product Manager", when: "Oct 7, 2026 10:18 AM", tone: "violet" },
];

/* ── §6.5 Interviews ────────────────────────────────────────────────────────────── */
export const INTERVIEWS_STATS = [
  { id: "week", value: "18", label: "Interviews This Week", delta: { value: "28%", up: true }, tone: "amber", spark: SPARK.c },
  { id: "mock", value: "26", label: "Mock Interviews", delta: { value: "18%", up: true }, tone: "violet", spark: SPARK.d },
  { id: "employer", value: "32", label: "Upcoming Employer Interviews", delta: { value: "25%", up: true }, tone: "green", spark: SPARK.a },
  { id: "offer", value: "68%", label: "Offer Rate", delta: { value: "12%", up: true }, tone: "blue", spark: SPARK.b },
] as const;

export const WEEK = {
  label: "Oct 6 - Oct 12, 2026",
  days: [
    { short: "Mon", date: "Oct 6" },
    { short: "Tue", date: "Oct 7" },
    { short: "Wed", date: "Oct 8" },
    { short: "Thu", date: "Oct 9" },
    { short: "Fri", date: "Oct 10" },
  ],
  /** First row of the grid = 9 AM … last = 4 PM. */
  hours: ["9 AM", "10 AM", "11 AM", "12 PM", "1 PM", "2 PM", "3 PM", "4 PM"],
};

export interface CalendarEvent {
  id: string;
  /** 0 = Mon … 4 = Fri */
  day: number;
  /** 24h start hour; the grid starts at 9. */
  start: number;
  /** Hours long (1 for every board event). */
  span: number;
  /** Time label shown on the block. */
  time: string;
  title: string;
  sub: string;
  tone: Tone;
}

export const CALENDAR_EVENTS: CalendarEvent[] = [
  { id: "e1", day: 0, start: 10, span: 1, time: "10:00 – 11:00 AM", title: "Product Designer", sub: "Google", tone: "blue" },
  { id: "e2", day: 0, start: 13, span: 1, time: "1:00 – 2:00 PM", title: "Mock Interview", sub: "Priya Nair", tone: "violet" },
  { id: "e3", day: 0, start: 15, span: 1, time: "3:00 PM", title: "UX Researcher", sub: "Microsoft", tone: "green" },
  { id: "e4", day: 1, start: 9, span: 1, time: "9:00 AM", title: "Software Engineer", sub: "Amazon", tone: "amber" },
  { id: "e5", day: 1, start: 13, span: 1, time: "1:00 – 2:00 PM", title: "Data Analyst", sub: "Salesforce", tone: "blue" },
  { id: "e6", day: 2, start: 11, span: 1, time: "11:00 AM – 12:00 PM", title: "Mock Interview", sub: "Aarav Mehta", tone: "violet" },
  { id: "e7", day: 2, start: 14, span: 1, time: "2:00 PM", title: "Product Manager", sub: "Notion", tone: "green" },
  { id: "e8", day: 3, start: 10, span: 1, time: "10:00 AM", title: "Software Engineer", sub: "Google", tone: "blue" },
  { id: "e9", day: 3, start: 13, span: 1, time: "1:00 PM", title: "Data Analyst", sub: "Microsoft", tone: "amber" },
  { id: "e10", day: 4, start: 10, span: 1, time: "10:00 AM", title: "UX Researcher", sub: "Spotify", tone: "green" },
  { id: "e11", day: 4, start: 13, span: 1, time: "1:00 PM", title: "Mock Interview", sub: "Neha Gupta", tone: "violet" },
];

export interface UpcomingInterview {
  id: string;
  name: string;
  company: string;
  role: string;
  type: string;
  when: string;
  interviewer: string;
  status: "Upcoming";
}
export const UPCOMING_INTERVIEWS: UpcomingInterview[] = [
  { id: "u1", name: "Aarav Mehta", company: "Google", role: "Product Designer", type: "Final Round", when: "Oct 8, 2026 2:00 PM", interviewer: "Sarah Kim", status: "Upcoming" },
  { id: "u2", name: "Sneha Patel", company: "Microsoft", role: "Data Analyst", type: "Technical", when: "Oct 8, 2026 11:00 AM", interviewer: "James Park", status: "Upcoming" },
  { id: "u3", name: "Vikram Reddy", company: "Amazon", role: "Software Engineer", type: "Technical", when: "Oct 9, 2026 10:00 AM", interviewer: "Priya Shah", status: "Upcoming" },
  { id: "u4", name: "Neha Gupta", company: "Notion", role: "Product Manager", type: "Final Round", when: "Oct 9, 2026 1:00 PM", interviewer: "Daniel Kim", status: "Upcoming" },
  { id: "u5", name: "Daniel Kim", company: "Spotify", role: "UX Researcher", type: "Behavioral", when: "Oct 10, 2026 9:00 AM", interviewer: "Emily Carter", status: "Upcoming" },
];

export const PREP_STATUS: { id: string; name: string; upcoming: number; progress: number; status: string; tone: Tone }[] = [
  { id: "p1", name: "Aarav Mehta", upcoming: 2, progress: 80, status: "On Track", tone: "green" },
  { id: "p2", name: "Sneha Patel", upcoming: 1, progress: 60, status: "In Progress", tone: "blue" },
  { id: "p3", name: "Vikram Reddy", upcoming: 1, progress: 45, status: "Needs Support", tone: "amber" },
  { id: "p4", name: "Neha Gupta", upcoming: 2, progress: 90, status: "Well Prepared", tone: "green" },
  { id: "p5", name: "Daniel Kim", upcoming: 1, progress: 50, status: "In Progress", tone: "violet" },
];

export const PREP_CHECKLIST = {
  percent: 75,
  items: [
    { label: "Resume Review", done: 5, total: 5, tone: "green" },
    { label: "Company Research", done: 4, total: 5, tone: "blue" },
    { label: "Mock Interviews", done: 3, total: 5, tone: "amber" },
    { label: "Behavioral Prep", done: 4, total: 5, tone: "violet" },
    { label: "Technical Prep", done: 3, total: 5, tone: "teal" },
  ] as { label: string; done: number; total: number; tone: Tone }[],
  tasks: [
    { id: "k1", text: "Review company background", date: "Oct 6", done: true },
    { id: "k2", text: "Practice common questions", date: "Oct 7", done: true },
    { id: "k3", text: "Complete mock interview", date: "Oct 8", done: false },
    { id: "k4", text: "Review portfolio / projects", date: "Oct 8", done: false },
    { id: "k5", text: "Prepare questions to ask", date: "Oct 9", done: false },
  ],
};

export const INTERVIEW_OUTCOMES: { id: string; company: string; role: string; name: string; date: string; outcome: string; tone: Tone }[] = [
  { id: "o1", company: "Google", role: "Product Designer", name: "Aarav Mehta", date: "Oct 5, 2026", outcome: "Offered", tone: "green" },
  { id: "o2", company: "Microsoft", role: "Data Analyst", name: "Sneha Patel", date: "Oct 3, 2026", outcome: "Next Round", tone: "blue" },
  { id: "o3", company: "Amazon", role: "Software Engineer", name: "Vikram Reddy", date: "Oct 2, 2026", outcome: "Rejected", tone: "coral" },
  { id: "o4", company: "Notion", role: "Product Manager", name: "Neha Gupta", date: "Oct 1, 2026", outcome: "Next Round", tone: "blue" },
  { id: "o5", company: "Spotify", role: "UX Researcher", name: "Daniel Kim", date: "Sep 29, 2026", outcome: "Offered", tone: "green" },
];

export const INTERVIEW_QUICK_ACTIONS = [
  { id: "q1", label: "Schedule Interview", sub: "Set up employer interviews", icon: "calendar" },
  { id: "q2", label: "Assign Mock Interview", sub: "Help employees practice", icon: "users" },
  { id: "q3", label: "Share Prep Pack", sub: "Send resources to employees", icon: "mail" },
  { id: "q4", label: "View Reports", sub: "Track interview performance", icon: "chart" },
] as const;

/* ── §6.8 Job Opportunities ─────────────────────────────────────────────────────── */
export type OppStatus = "Open" | "In Progress" | "Reviewing";
export interface OpportunityRow {
  id: string;
  company: string;
  role: string;
  location: string;
  mode: "Hybrid" | "Remote";
  assigned: number;
  match: number;
  owner: string;
  status: OppStatus;
}
export const OPP_STATUS_TONE: Record<OppStatus, Tone> = { Open: "green", "In Progress": "blue", Reviewing: "amber" };

export const OPPORTUNITIES_STATS = [
  { id: "open", value: "48", label: "Open Roles", delta: { value: "12%", up: true }, tone: "blue", spark: SPARK.a },
  { id: "assigned", value: "326", label: "Assigned Opportunities", delta: { value: "28%", up: true }, tone: "green", spark: SPARK.b },
  { id: "responses", value: "92", label: "Employer Responses", delta: { value: "18%", up: true }, tone: "amber", spark: SPARK.c },
  { id: "placements", value: "56", label: "Placements Started", delta: { value: "33%", up: true }, tone: "violet", spark: SPARK.d },
] as const;

export const OPPORTUNITIES: OpportunityRow[] = [
  { id: "o1", company: "Google", role: "Product Designer", location: "San Francisco, CA", mode: "Hybrid", assigned: 6, match: 92, owner: "Priya Nair", status: "Open" },
  { id: "o2", company: "Microsoft", role: "Software Engineer", location: "Seattle, WA", mode: "Remote", assigned: 8, match: 88, owner: "Rahul Sharma", status: "Open" },
  { id: "o3", company: "Amazon", role: "Data Analyst", location: "New York, NY", mode: "Hybrid", assigned: 5, match: 82, owner: "Aishwarya K.", status: "In Progress" },
  { id: "o4", company: "Salesforce", role: "UX Researcher", location: "San Francisco, CA", mode: "Remote", assigned: 4, match: 78, owner: "Vikram R.", status: "In Progress" },
  { id: "o5", company: "Adobe", role: "Product Manager", location: "Seattle, WA", mode: "Hybrid", assigned: 7, match: 76, owner: "Neha Gupta", status: "Open" },
  { id: "o6", company: "Stripe", role: "Software Engineer", location: "New York, NY", mode: "Remote", assigned: 3, match: 72, owner: "Daniel Kim", status: "Reviewing" },
  { id: "o7", company: "Notion", role: "Growth Marketing", location: "Austin, TX", mode: "Hybrid", assigned: 4, match: 68, owner: "Fatima Khan", status: "Open" },
  { id: "o8", company: "Meta", role: "Data Scientist", location: "Menlo Park, CA", mode: "Remote", assigned: 5, match: 66, owner: "Rohan Desai", status: "In Progress" },
  { id: "o9", company: "Spotify", role: "Business Analyst", location: "New York, NY", mode: "Hybrid", assigned: 2, match: 64, owner: "Emily Chen", status: "Open" },
  { id: "o10", company: "Airbnb", role: "Product Designer", location: "San Francisco, CA", mode: "Remote", assigned: 3, match: 61, owner: "Arjun Nair", status: "Reviewing" },
];

export const TOP_HIRING = [
  { company: "Google", roles: 12, pct: 25, tone: "blue" },
  { company: "Microsoft", roles: 9, pct: 19, tone: "green" },
  { company: "Amazon", roles: 7, pct: 15, tone: "amber" },
  { company: "Salesforce", roles: 6, pct: 13, tone: "violet" },
  { company: "Adobe", roles: 5, pct: 10, tone: "slate" },
] as const;

export const PIPELINE_DONUT = [
  { label: "Open", value: 18, tone: "blue" },
  { label: "Assigned", value: 14, tone: "green" },
  { label: "In Progress", value: 8, tone: "amber" },
  { label: "Reviewing", value: 5, tone: "violet" },
  { label: "Closed", value: 3, tone: "slate" },
] as const;

export const RECENT_ASSIGNMENTS = [
  { id: "s1", name: "Aarav Mehta", role: "Product Designer", company: "Google", ago: "2h ago" },
  { id: "s2", name: "Sneha Patel", role: "Software Engineer", company: "Microsoft", ago: "6h ago" },
  { id: "s3", name: "Neha Gupta", role: "Data Analyst", company: "Amazon", ago: "1d ago" },
  { id: "s4", name: "Rohan Desai", role: "Product Manager", company: "Adobe", ago: "1d ago" },
  { id: "s5", name: "Fatima Khan", role: "UX Researcher", company: "Salesforce", ago: "2d ago" },
];

/* ── §6.9 Dashboard + Team Management ───────────────────────────────────────────── */
export const DASHBOARD_STATS = [
  { id: "employees", value: "85", label: "Employees", delta: { value: "8%", up: true }, tone: "blue", spark: SPARK.a },
  { id: "applications", value: "124", label: "Applications", delta: { value: "32%", up: true }, tone: "green", spark: SPARK.b },
  { id: "interviews", value: "32", label: "Interviews", delta: { value: "20%", up: true }, tone: "amber", spark: SPARK.c },
  { id: "placements", value: "12", label: "Placements", delta: { value: "33%", up: true }, tone: "violet", spark: SPARK.d },
] as const;

export const PLACEMENT_PIPELINE: { label: string; value: number; tone: Tone }[] = [
  { label: "Applied", value: 124, tone: "blue" },
  { label: "In Review", value: 48, tone: "violet" },
  { label: "Interview", value: 32, tone: "amber" },
  { label: "Offer", value: 18, tone: "teal" },
  { label: "Placed", value: 12, tone: "green" },
];

export const DASHBOARD_QUICK_ACTIONS = [
  { id: "d1", label: "Add Employee", href: "/org/team", icon: "user" },
  { id: "d2", label: "Add Opportunity", href: "/org/opportunities", icon: "briefcase" },
  { id: "d3", label: "Schedule Interview", href: "/org/interviews", icon: "calendar" },
  { id: "d4", label: "View Reports", href: "/org/analytics", icon: "chart" },
] as const;

export const TEAM_STATS = [
  { id: "employees", value: "85", label: "Employees", tone: "blue", spark: SPARK.a },
  { id: "seats", value: "72", label: "Active Seats", tone: "green", spark: SPARK.b },
  { id: "owners", value: "6", label: "Support Owners", tone: "violet", spark: SPARK.d },
  { id: "attention", value: "12", label: "Needs Attention", tone: "amber", spark: SPARK.c },
] as const;

export const TEAM_TABS = [
  { id: "all", label: "All Employees", count: 85 },
  { id: "active", label: "Active", count: 72 },
  { id: "attention", label: "Needs Attention", count: 12 },
  { id: "placed", label: "Placed", count: 12 },
];

export interface EmployeeRow {
  id: string;
  name: string;
  role: string;
  department: string;
  owner: string;
  stage: Stage;
  last: string;
  /** Which team tabs the row appears under besides "all" (sample grouping). */
  groups: ("active" | "attention" | "placed")[];
}
export const EMPLOYEES: EmployeeRow[] = [
  { id: "m1", name: "Aarav Mehta", role: "Product Designer", department: "Product", owner: "Priya Nair", stage: "Interviewing", last: "2 days ago", groups: ["active"] },
  { id: "m2", name: "Sneha Patel", role: "Software Engineer", department: "Engineering", owner: "Rahul Sharma", stage: "Applied", last: "1 day ago", groups: ["active"] },
  { id: "m3", name: "Vikram Reddy", role: "Data Analyst", department: "Data", owner: "Aishwarya K.", stage: "Offer", last: "3 days ago", groups: ["active", "placed"] },
  { id: "m4", name: "Neha Gupta", role: "Product Manager", department: "Product", owner: "Vikram R.", stage: "In Review", last: "1 day ago", groups: ["active"] },
  { id: "m5", name: "Daniel Kim", role: "UX Researcher", department: "Design", owner: "Priya Nair", stage: "Rejected", last: "2 days ago", groups: ["attention"] },
  { id: "m6", name: "Fatima Khan", role: "Marketing Specialist", department: "Marketing", owner: "Rahul Sharma", stage: "Interviewing", last: "4 hours ago", groups: ["active", "attention"] },
  { id: "m7", name: "Rohan Desai", role: "Software Engineer", department: "Engineering", owner: "Aishwarya K.", stage: "In Review", last: "6 hours ago", groups: ["active"] },
  { id: "m8", name: "Emily Chen", role: "Data Analyst", department: "Data", owner: "Vikram R.", stage: "Applied", last: "2 days ago", groups: ["active", "attention"] },
];

export const DEPARTMENTS = [
  { label: "Engineering", value: 28, tone: "blue" },
  { label: "Product", value: 18, tone: "green" },
  { label: "Design", value: 12, tone: "amber" },
  { label: "Data", value: 14, tone: "violet" },
  { label: "Marketing", value: 8, tone: "coral" },
  { label: "Sales", value: 5, tone: "teal" },
] as const;

export const SUPPORT_OWNERS = [
  { name: "Priya Nair", count: 16 },
  { name: "Rahul Sharma", count: 15 },
  { name: "Aishwarya K.", count: 14 },
  { name: "Vikram R.", count: 14 },
  { name: "Neha Gupta", count: 13 },
  { name: "Daniel Kim", count: 13 },
];

export interface Stat {
  value: string;
  label: string;
  tone: Tone;
  delta?: { value: string; up: boolean };
  spark: number[];
}

/* ── 6.6 Analytics & Reports ──────────────────────────────────────────────────────────── */
export const ANALYTICS_STATS: Stat[] = [
  { value: "124", label: "Total Applications", tone: "blue", delta: { value: "32%", up: true }, spark: [3, 4, 4, 6, 5, 8, 9, 12] },
  { value: "72", label: "Interviews Conducted", tone: "green", delta: { value: "28%", up: true }, spark: [2, 3, 3, 5, 6, 6, 8, 9] },
  { value: "18", label: "Offers Extended", tone: "amber", delta: { value: "50%", up: true }, spark: [1, 2, 2, 3, 3, 5, 5, 7] },
  { value: "12", label: "Placements", tone: "violet", delta: { value: "33%", up: true }, spark: [1, 1, 2, 2, 3, 3, 4, 6] },
  { value: "72%", label: "Placement Success Rate", tone: "teal", delta: { value: "14%", up: true }, spark: [4, 4, 5, 5, 6, 6, 7, 8] },
];

export const ANALYTICS_FILTERS = {
  dateRange: ["Last 30 days", "Last 7 days", "Last 90 days", "This year"],
  department: ["All Departments", "Product", "Engineering", "Design", "Data", "Marketing", "Sales"],
  roleCategory: ["All Roles", "Design", "Engineering", "Product", "Data", "Marketing"],
  supportOwner: ["All Support Owners", "Priya Nair", "Rahul Sharma", "Aishwarya K.", "Vikram R.", "Neha Gupta"],
};

export const FUNNEL_SERIES: { label: string; tone: Tone }[] = [
  { label: "Applications", tone: "blue" },
  { label: "Interviews", tone: "green" },
  { label: "Offers", tone: "amber" },
  { label: "Placements", tone: "violet" },
];

export const APPLICATION_TREND = [
  { label: "Sep 10", values: [25, 18, 8, 5] },
  { label: "Sep 17", values: [32, 20, 10, 6] },
  { label: "Sep 24", values: [30, 22, 9, 5] },
  { label: "Oct 1", values: [28, 18, 8, 4] },
  { label: "Oct 8", values: [38, 25, 12, 7] },
];

export const PLACEMENT_FUNNEL: { label: string; value: number; pct: number; tone: Tone }[] = [
  { label: "Applications", value: 124, pct: 100, tone: "blue" },
  { label: "Interviewed", value: 72, pct: 58, tone: "green" },
  { label: "Offers", value: 18, pct: 15, tone: "amber" },
  { label: "Placed", value: 12, pct: 10, tone: "violet" },
];

export const RESPONSE_RATE = {
  xLabels: ["Sep 10", "Sep 17", "Sep 24", "Oct 1", "Oct 8"],
  yLabels: ["0%", "25%", "50%", "75%", "100%"],
  series: [
    { label: "Application Response Rate", tone: "blue" as Tone, points: [55, 62, 66, 72, 78] },
    { label: "Offer Acceptance Rate", tone: "green" as Tone, points: [30, 40, 48, 58, 67] },
  ],
  endLabels: ["78%", "67%"],
};

export const DEPARTMENT_PERFORMANCE = [
  { label: "Product", values: [40, 30, 18, 14] },
  { label: "Engineering", values: [34, 25, 15, 10] },
  { label: "Design", values: [28, 20, 12, 8] },
  { label: "Data", values: [24, 18, 10, 7] },
  { label: "Marketing", values: [22, 16, 9, 6] },
  { label: "Sales", values: [20, 14, 8, 5] },
];

export const SUPPORT_OWNER_PERFORMANCE = [
  { name: "Priya Nair", applications: 28, interviews: 16, offers: 5, placements: 4, rate: "80%" },
  { name: "Rahul Sharma", applications: 24, interviews: 14, offers: 4, placements: 3, rate: "75%" },
  { name: "Aishwarya K.", applications: 18, interviews: 10, offers: 3, placements: 2, rate: "67%" },
  { name: "Vikram R.", applications: 16, interviews: 9, offers: 3, placements: 2, rate: "67%" },
  { name: "Neha Gupta", applications: 14, interviews: 8, offers: 2, placements: 1, rate: "63%" },
];

export const ROI_TILES: { value: string; label: string; tone: Tone; delta: { value: string; up: boolean } }[] = [
  { value: "12", label: "Employees Placed", tone: "green", delta: { value: "33%", up: true } },
  { value: "28", label: "Avg. Days to Place", tone: "violet", delta: { value: "22%", up: false } },
  { value: "3.2x", label: "ROI Estimate", tone: "amber", delta: { value: "28%", up: true } },
  { value: "96%", label: "Hiring Manager Satisfaction", tone: "blue", delta: { value: "12%", up: true } },
];

/* ── 6.7 AI Resume Support ────────────────────────────────────────────────────────────── */
export const RESUME_STATS: Stat[] = [
  { value: "156", label: "Resumes Reviewed", tone: "blue", delta: { value: "24%", up: true }, spark: [3, 4, 4, 6, 5, 8, 9, 12] },
  { value: "132", label: "ATS Ready", tone: "green", delta: { value: "32%", up: true }, spark: [2, 3, 3, 5, 6, 6, 8, 9] },
  { value: "48", label: "Tailored This Week", tone: "amber", delta: { value: "28%", up: true }, spark: [1, 2, 2, 3, 3, 5, 5, 7] },
  { value: "12", label: "Needs Attention", tone: "coral", delta: { value: "20%", up: true }, spark: [5, 4, 5, 4, 5, 6, 5, 7] },
];

export type ResumeStatus = "ATS Ready" | "Needs Review" | "Needs Attention" | "Review Suggested";
export interface EmployeeResume {
  name: string;
  currentRole: string;
  targetRole: string;
  resumeScore: number;
  atsScore: number;
  latestVersion: string;
  status: ResumeStatus;
  tab: "attention" | "ready";
}

export const EMPLOYEE_RESUMES: EmployeeResume[] = [
  { name: "Priya Nair", currentRole: "Product Designer", targetRole: "Senior Product Designer", resumeScore: 92, atsScore: 88, latestVersion: "Oct 8, 2026", status: "ATS Ready", tab: "ready" },
  { name: "Rahul Sharma", currentRole: "Software Engineer", targetRole: "Senior Software Engineer", resumeScore: 78, atsScore: 72, latestVersion: "Oct 7, 2026", status: "Needs Review", tab: "attention" },
  { name: "Aishwarya K.", currentRole: "Data Analyst", targetRole: "Data Scientist", resumeScore: 85, atsScore: 80, latestVersion: "Oct 6, 2026", status: "ATS Ready", tab: "ready" },
  { name: "Vikram R.", currentRole: "Salesforce Developer", targetRole: "Technical Architect", resumeScore: 66, atsScore: 58, latestVersion: "Oct 6, 2026", status: "Needs Attention", tab: "attention" },
  { name: "Neha Gupta", currentRole: "Product Manager", targetRole: "Senior Product Manager", resumeScore: 90, atsScore: 86, latestVersion: "Oct 5, 2026", status: "ATS Ready", tab: "ready" },
  { name: "Daniel Kim", currentRole: "UX Researcher", targetRole: "Senior UX Researcher", resumeScore: 74, atsScore: 70, latestVersion: "Oct 4, 2026", status: "Review Suggested", tab: "attention" },
  { name: "Fatima Khan", currentRole: "Marketing Specialist", targetRole: "Growth Marketer", resumeScore: 82, atsScore: 76, latestVersion: "Oct 4, 2026", status: "ATS Ready", tab: "ready" },
  { name: "Rohan Desai", currentRole: "Software Engineer", targetRole: "DevOps Engineer", resumeScore: 69, atsScore: 64, latestVersion: "Oct 3, 2026", status: "Needs Attention", tab: "attention" },
];

export const RESUME_TABS = [
  { id: "all", label: "All Employees", count: 85 },
  { id: "attention", label: "Needs Attention", count: 12 },
  { id: "ready", label: "ATS Ready", count: 132 },
  { id: "none", label: "No Resume", count: 8 },
  { id: "dept", label: "Departments", menu: true },
];

export const RESUME_SUGGESTIONS = {
  name: "Rahul Sharma",
  role: "Software Engineer",
  resumeScore: 78,
  atsScore: 72,
  items: [
    { id: "keywords", title: "Add Missing Keywords", body: 'Include "React", "AWS", "CI/CD", "Docker" to match Senior Software Engineer roles.', tone: "blue" as Tone },
    { id: "bullets", title: "Stronger Bullet Points", body: 'Use more impact-driven bullets with quantifiable results (e.g., "Improved system performance by 40%").', tone: "green" as Tone },
    { id: "summary", title: "Improve Summary", body: "Highlight 5+ years of experience and core strengths in a more compelling summary.", tone: "violet" as Tone },
    { id: "alignment", title: "Better Role Alignment", body: "Tailor your resume for Senior Software Engineer roles using industry-relevant skills and terminology.", tone: "amber" as Tone },
  ],
};

export const RESUME_TOOLS: { title: string; body: string; tone: Tone }[] = [
  { title: "Bulk Tailor Resumes", body: "Select multiple employees and tailor their resumes for specific job roles using AI.", tone: "blue" },
  { title: "Resume Comparison", body: "Compare multiple resume versions to see improvements and ATS score changes.", tone: "violet" },
  { title: "Cover Letter Drafts", body: "Generate personalized cover letters to match target roles and job descriptions.", tone: "green" },
];

/* ── 6.2 Integrations ─────────────────────────────────────────────────────────────────── */
export const INTEGRATION_STATS: Stat[] = [
  { value: "8", label: "Connected Apps", tone: "blue", delta: { value: "33%", up: true }, spark: [2, 3, 3, 4, 5, 5, 7, 8] },
  { value: "98%", label: "Sync Health", tone: "green", delta: { value: "12%", up: true }, spark: [5, 6, 6, 7, 8, 8, 9, 10] },
  { value: "6", label: "Active Automations", tone: "amber", delta: { value: "50%", up: true }, spark: [1, 2, 2, 3, 3, 4, 5, 6] },
  { value: "3", label: "Pending Actions", tone: "violet", delta: { value: "25%", up: false }, spark: [8, 7, 7, 6, 5, 5, 4, 3] },
];

export const INTEGRATIONS: { name: string; lastSync: string; data: string }[] = [
  { name: "LinkedIn", lastSync: "Oct 8, 2026 2:14 PM", data: "Job posts, candidates, company info" },
  { name: "Indeed", lastSync: "Oct 8, 2026 11:20 AM", data: "Job postings, applications, candidates" },
  { name: "Greenhouse", lastSync: "Oct 7, 2026 4:35 PM", data: "Job postings, candidates, interviews" },
  { name: "Workday", lastSync: "Oct 6, 2026 3:22 PM", data: "Employee data, job requisitions, org chart" },
  { name: "Gmail", lastSync: "Oct 8, 2026 10:18 AM", data: "Email communication, interview invites" },
  { name: "Outlook", lastSync: "Oct 6, 2026 1:05 PM", data: "Email communication, calendar events" },
  { name: "Slack", lastSync: "Oct 5, 2026 4:50 PM", data: "Channel notifications, application updates" },
  { name: "Google Calendar", lastSync: "Oct 5, 2026 11:12 AM", data: "Interview schedules, team availability" },
  { name: "Google Drive", lastSync: "Oct 4, 2026 9:30 AM", data: "Resumes, documents, placement files" },
];

export const API_ACCESS_ROWS = [
  { id: "keys", title: "API Keys", sub: "2 active keys", cta: "Manage" },
  { id: "hooks", title: "Webhook Endpoints", sub: "1 active endpoint", cta: "Manage" },
  { id: "docs", title: "API Documentation", sub: "View docs and guides", cta: "View Docs", external: true },
];

export const NOTIFICATION_ROUTES = [
  { title: "Interview Invites", sub: "Slack #interviews", alert: false },
  { title: "Application Updates", sub: "Slack #applications", alert: false },
  { title: "Placement Confirmations", sub: "Email to hiring team", alert: false },
  { title: "Sync Failures", sub: "Email to admins", alert: true },
];

export const AUTOMATION_FLOWS = [
  { id: "a1", title: "Create interview event from application", sub: "Indeed → Google Calendar" },
  { id: "a2", title: "Notify hiring team on new application", sub: "Greenhouse → Slack" },
  { id: "a3", title: "Sync new employees to Workday", sub: "Kiwiply → Workday" },
  { id: "a4", title: "Save resumes to Drive", sub: "Applications → Google Drive" },
];

/* ── 6.4 Settings ─────────────────────────────────────────────────────────────────────── */
export const ABOUT_COMPANY =
  "Acme Corp is a technology company building innovative solutions for a brighter future. We're committed to diversity, growth, and creating meaningful opportunities for talent worldwide.";

export const INDUSTRIES = ["Technology", "Finance", "Healthcare", "Education", "Retail", "Consulting", "Manufacturing"];
export const COMPANY_SIZES = ["1 - 50 employees", "51 - 200 employees", "201 - 500 employees", "501 - 1,000 employees", "1,001+ employees"];
export const DEFAULT_ROLES = ["Recruiter", "Hiring Manager", "Admin", "Support Owner", "Viewer"];

export const PERMISSION_TOGGLES = [
  { id: "salary", label: "Access to Salary Information", body: "Allow team members to view salary details in job postings.", on: true },
  { id: "candidates", label: "Can Manage Candidates", body: "Allow team members to view and manage candidate data.", on: true },
  { id: "postings", label: "Can Create Job Postings", body: "Allow team members to create new job postings.", on: true },
  { id: "export", label: "Can Export Analytics", body: "Allow Expert members to export analytics reports.", on: false },
];

export const ADMIN_ROLES: { name: string; email: string; role: string; tone: Tone }[] = [
  { name: "Priya Nair", email: "priya@acmecorp.com", role: "Super Admin", tone: "violet" },
  { name: "Rahul Sharma", email: "rahul@acmecorp.com", role: "Admin", tone: "blue" },
  { name: "Aishwarya K.", email: "aishwarya@acmecorp.com", role: "Hiring Manager", tone: "green" },
  { name: "Vikram R.", email: "vikram@acmecorp.com", role: "Recruiter", tone: "amber" },
];

export const APPROVAL_RULES = [
  { title: "Job Posting Approval", body: "Requires approval from Hiring Manager" },
  { title: "Offer Approval", body: "Requires approval from Department Head" },
  { title: "Placement Approval", body: "Requires approval from Recruitment Head" },
];

export const SECURITY_CHECKS = ["SSO Enabled", "2FA Required", "Data Encryption (AES-256)", "Regular Security Scans"];

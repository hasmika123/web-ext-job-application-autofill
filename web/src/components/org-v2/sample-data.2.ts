/**
 * SAMPLE — board data, not from the API; replace when the feature ships.
 *
 * Phase C2 (analytics, AI resume support, integrations, billing, settings). Transcribed from
 * `web/APP-V2-SPEC.md` 6.2, 6.3, 6.4, 6.6, 6.7. C1 keeps its own `sample-data.ts`; the QA phase
 * merges the two.
 */
import type { Tone } from "@/components/app-v2/common/tones";

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

/* ── 6.3 Billing & Subscription ───────────────────────────────────────────────────────── */
export const PLAN_FEATURES = [
  "AI Resume Support",
  "Advanced Analytics",
  "Team Collaboration",
  "Custom Integrations",
  "Dedicated Support",
  "Priority Access",
];

export const INVOICES = [
  { id: "INV-2026-010", date: "Oct 15, 2026", description: "Enterprise Plan (72 seats)", amount: "$1,800.00" },
  { id: "INV-2026-009", date: "Sep 15, 2026", description: "Enterprise Plan (68 seats)", amount: "$1,700.00" },
  { id: "INV-2026-008", date: "Aug 15, 2026", description: "Enterprise Plan (65 seats)", amount: "$1,625.00" },
  { id: "INV-2026-007", date: "Jul 15, 2026", description: "Enterprise Plan (62 seats)", amount: "$1,550.00" },
  { id: "INV-2026-006", date: "Jun 15, 2026", description: "Enterprise Plan (60 seats)", amount: "$1,500.00" },
];

export const USAGE: { label: string; used: string; pct: number; tone: Tone }[] = [
  { label: "AI Resume Support", used: "842 / 1,000 resumes", pct: 84, tone: "violet" },
  { label: "Job Applications", used: "1,240 / 2,000 applications", pct: 62, tone: "blue" },
  { label: "Integrations", used: "404 / 500 API calls", pct: 81, tone: "green" },
];

export const SUBSCRIPTION_DETAILS: { label: string; value: string; chip?: boolean }[] = [
  { label: "Plan", value: "Enterprise" },
  { label: "Active Seats", value: "72 / 100" },
  { label: "Billing Cycle", value: "Monthly" },
  { label: "Next Renewal", value: "Nov 15, 2026" },
  { label: "Plan Started", value: "Jan 15, 2025" },
  { label: "Annual Contract", value: "Yes" },
  { label: "Auto-Renewal", value: "Enabled", chip: true },
  { label: "Currency", value: "USD" },
];

export const UPGRADE_OPTIONS = [
  { title: "Add More Seats", body: "Scale your team as you grow." },
  { title: "Custom Plan", body: "Need a tailored solution?" },
];

export const BILLING_CONTACTS = [
  { name: "Priya Nair", role: "Primary Billing Contact", email: "priya.nair@acmecorp.com" },
  { name: "Rahul Sharma", role: "Finance Team", email: "rahul.sharma@acmecorp.com" },
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

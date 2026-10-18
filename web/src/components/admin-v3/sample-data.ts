/**
 * SAMPLE: illustrative numbers for the admin v3 boards (design/admin-v3). None of this comes from the
 * API. Anything the live API already returns (user list, /api/admin/analytics KPIs) is used instead
 * wherever the pages fetch it; these fill the rest of each board and every panel using them
 * carries a "Sample data" tag. Other admin pages: add your own section below, keep it SAMPLE-marked.
 */
import type { Tone } from "@/components/app-v2/common";

// ---------------------------------------------------------------- Overview (board 21)

/** SAMPLE: tile sparklines + deltas (real KPI values override the numbers, not these). */
export const OVERVIEW_TILE_EXTRAS = {
  totalUsers: { delta: { value: "12%", dir: "up" as const }, spark: [3, 4, 3, 5, 4, 6, 7, 6, 8, 9], caption: "vs last 30 days" },
  activation: { delta: { value: "6%", dir: "up" as const }, spark: [4, 3, 5, 4, 6, 6, 7, 8, 7, 9], caption: "vs last 30 days" },
  signups: { delta: { value: "24%", dir: "up" as const }, spark: [2, 3, 3, 5, 4, 6, 5, 8, 7, 9], caption: "vs previous 7 days" },
  active: { delta: { value: "18%", dir: "up" as const }, spark: [5, 4, 6, 5, 7, 6, 8, 7, 9, 10], caption: "vs previous 7 days" },
};

/** SAMPLE: "User growth & signups" 30-day series (bars = new signups, line = active users). */
export const GROWTH_SIGNUPS = [18, 32, 14, 26, 12, 40, 36, 48, 22, 30, 52, 44, 38, 60, 28, 46, 70, 64, 56, 42, 80, 58, 110, 150, 120, 96, 62, 90, 74, 66];
export const GROWTH_ACTIVE = [52, 70, 64, 68, 60, 88, 96, 90, 100, 84, 104, 108, 100, 118, 96, 104, 120, 114, 112, 124, 128, 122, 138, 164, 146, 150, 132, 142, 150, 158];
export const GROWTH_X = ["Sep 10", "Sep 17", "Sep 24", "Oct 1", "Oct 8"];

/** SAMPLE: platform health rows. */
export const PLATFORM_HEALTH: { label: string; status: "Healthy" | "Needs attention" }[] = [
  { label: "Application", status: "Healthy" },
  { label: "Database", status: "Healthy" },
  { label: "AI services", status: "Healthy" },
  { label: "Job sources", status: "Healthy" },
  { label: "Email delivery", status: "Healthy" },
  { label: "Background jobs", status: "Healthy" },
  { label: "External integrations", status: "Needs attention" },
  { label: "Security & monitoring", status: "Healthy" },
];

// ---------------------------------------------------------------- Users (boards 9 / 17)

/** SAMPLE: tiles not backed by the API (pending invites + suspended have no endpoint). */
export const USERS_TILE_EXTRAS = {
  total: { delta: { value: "12%", dir: "up" as const }, spark: [3, 4, 5, 4, 6, 7, 6, 8, 9, 10] },
  active: { delta: { value: "8%", dir: "up" as const }, spark: [4, 5, 4, 6, 6, 7, 8, 7, 9, 9] },
  pending: { value: 86, delta: { value: "24%", dir: "up" as const }, spark: [3, 4, 3, 5, 6, 5, 7, 6, 8, 9] },
  suspended: { value: 24, delta: { value: "9%", dir: "up" as const, good: false }, spark: [6, 5, 7, 6, 8, 7, 9, 8, 10, 9] },
};

/** SAMPLE: "User segments" donut. */
export const USER_SEGMENTS: { label: string; value: number; tone: Tone; pct: number }[] = [
  { label: "Active users", value: 1042, tone: "blue", pct: 81 },
  { label: "Pending invites", value: 86, tone: "green", pct: 7 },
  { label: "Suspended users", value: 24, tone: "violet", pct: 2 },
  { label: "Inactive (30+ days)", value: 132, tone: "amber", pct: 10 },
];

/** SAMPLE: "Role distribution" bars. */
export const ROLE_DISTRIBUTION: { label: string; value: number; tone: Tone; pct: number; icon: "crown" | "users" | "eye" | "user" }[] = [
  { label: "Admins", value: 48, tone: "violet", pct: 4, icon: "crown" },
  { label: "Managers", value: 186, tone: "amber", pct: 15, icon: "users" },
  { label: "Members", value: 872, tone: "blue", pct: 68, icon: "users" },
  { label: "Viewers", value: 178, tone: "slate", pct: 14, icon: "eye" },
];

/** SAMPLE: "Recent account actions". */
export const RECENT_ACCOUNT_ACTIONS: { who: string; what: string; when: string }[] = [
  { who: "Ava Wilson", what: "Updated profile information", when: "2 hours ago" },
  { who: "Liam Chen", what: "Invited a new user (isabella@freelance.com)", when: "5 hours ago" },
  { who: "Noah Patel", what: "Changed user role (Member to Manager)", when: "1 day ago" },
  { who: "System", what: "Suspended user (emma.thompson@globalhq.com)", when: "4 days ago" },
];

// ---------------------------------------------------------------- Security (board 17 security)

export const SECURITY_TILES = {
  sessions: { value: "124", delta: { value: "12%", dir: "up" as const }, spark: [3, 4, 3, 5, 6, 5, 7, 8, 7, 9] },
  failed: { value: "18", delta: { value: "32%", dir: "down" as const, good: true }, spark: [9, 8, 9, 7, 8, 6, 7, 5, 6, 4] },
  mfa: { value: "71%", delta: { value: "6%", dir: "up" as const }, spark: [3, 4, 4, 5, 5, 6, 7, 6, 8, 9] },
  requests: { value: "7", delta: { value: "42%", dir: "down" as const, good: true }, spark: [8, 9, 7, 8, 6, 7, 5, 6, 4, 5] },
};

export type Severity = "Low" | "Medium" | "High";

export const SECURITY_EVENTS: { time: string; event: string; user: string; details: string; severity: Severity }[] = [
  { time: "Oct 8, 14:32", event: "Successful login", user: "maya.chen@kiwiply.com", details: "Web, Chrome, macOS", severity: "Low" },
  { time: "Oct 8, 13:11", event: "Failed login attempt", user: "unknown@example.com", details: "Invalid password", severity: "High" },
  { time: "Oct 8, 12:46", event: "MFA enabled", user: "james.lee@kiwiply.com", details: "Authenticator app", severity: "Low" },
  { time: "Oct 8, 11:20", event: "Role updated", user: "sarah.kim@kiwiply.com", details: "Viewer to Editor", severity: "Medium" },
  { time: "Oct 8, 10:05", event: "Access request", user: "alex.tan@kiwiply.com", details: "Requested Analytics access", severity: "Medium" },
];

export const SUSPICIOUS_ALERTS: { title: string; detail: string; when: string; severity: Severity }[] = [
  { title: "Multiple failed login attempts", detail: "5 failed attempts from 203.0.113.42", when: "Oct 8, 13:11", severity: "High" },
  { title: "Unusual login location", detail: "Login from a new location (Singapore)", when: "Oct 8, 09:24", severity: "Medium" },
  { title: "New device login", detail: "First time login from Safari on macOS", when: "Oct 7, 18:03", severity: "Medium" },
  { title: "Rapid API requests", detail: "Unusual spike in API usage", when: "Oct 7, 16:41", severity: "Low" },
  { title: "Access to sensitive data", detail: "Bulk export of user data", when: "Oct 7, 14:22", severity: "Medium" },
];

export const PASSWORD_RESETS: { time: string; user: string; method: string; status: "Completed" | "Failed" }[] = [
  { time: "Oct 8, 11:03", user: "linda.wang@kiwiply.com", method: "Email link", status: "Completed" },
  { time: "Oct 7, 19:44", user: "michael.brown@kiwiply.com", method: "Admin reset", status: "Completed" },
  { time: "Oct 7, 16:21", user: "emily.davis@kiwiply.com", method: "Email link", status: "Completed" },
  { time: "Oct 6, 13:15", user: "daniel.park@kiwiply.com", method: "MFA recovery", status: "Completed" },
  { time: "Oct 5, 10:02", user: "sophia.ng@kiwiply.com", method: "Email link", status: "Failed" },
];

export const BLOCKED_IPS: { ip: string; attempts: number; last: string; status: "Blocked" | "Monitor" }[] = [
  { ip: "203.0.113.42", attempts: 12, last: "Oct 8, 13:11", status: "Blocked" },
  { ip: "198.51.100.17", attempts: 8, last: "Oct 8, 09:24", status: "Blocked" },
  { ip: "192.0.2.56", attempts: 6, last: "Oct 7, 22:10", status: "Blocked" },
  { ip: "185.199.111.23", attempts: 5, last: "Oct 7, 18:03", status: "Blocked" },
  { ip: "203.0.113.91", attempts: 4, last: "Oct 7, 16:41", status: "Monitor" },
];

/** SAMPLE: other Security tabs. */
export const ROLES_MATRIX: { role: string; people: number; perms: string }[] = [
  { role: "Admin", people: 48, perms: "Everything, including security and billing" },
  { role: "Manager", people: 186, perms: "Manage members, view analytics, no billing" },
  { role: "Member", people: 872, perms: "Use the product, edit own data" },
  { role: "Viewer", people: 178, perms: "Read-only" },
];
export const SESSIONS_SAMPLE: { user: string; device: string; ip: string; started: string }[] = [
  { user: "maya.chen@kiwiply.com", device: "Chrome on macOS", ip: "203.0.113.8", started: "Oct 8, 14:32" },
  { user: "james.lee@kiwiply.com", device: "Safari on iOS", ip: "198.51.100.4", started: "Oct 8, 12:46" },
  { user: "sarah.kim@kiwiply.com", device: "Firefox on Windows", ip: "192.0.2.77", started: "Oct 8, 09:10" },
];
export const POLICIES: { name: string; value: string }[] = [
  { name: "Session lifetime", value: "15 min access token, 90 day rolling refresh" },
  { name: "Password policy", value: "Minimum length enforced by the API" },
  { name: "Multi-factor authentication", value: "Optional (not yet available)" },
  { name: "Failed login lockout", value: "Planned" },
];

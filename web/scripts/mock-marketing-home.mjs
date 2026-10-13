/**
 * The Marketing Home API mock (marketer workspace), in memory, DEV ONLY: `GET /api/orgs/{orgId}/me-workspace/marketing/home`.
 * The rows are the approved "Talent Marketing Dashboard" board, so the page can be compared to it side by side. Only acme (id 2)
 * members who hold the marketing grants see it; anyone else gets the API's 404.
 */
const MEMBERS = new Set(["marketer@acme.com", "sarah@acme.com", "demo-ent-acme-omar", "demo-ent-acme-sarah"]);
const at = (h, m) => {
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};
const ago = (ms) => new Date(Date.now() - ms).toISOString();
const MIN = 60e3;
const H = 60 * MIN;

const view = () => ({
  kpis: [
    { key: "assigned", value: 28, deltaPct: 12, sparkline: [3, 4, 4, 6, 5, 8, 9, 11] },
    { key: "profilesReady", value: 24, deltaPct: 9, sparkline: [4, 5, 5, 7, 6, 8, 9, 10] },
    { key: "newMatches", value: 56, deltaPct: 18, sparkline: [3, 5, 4, 7, 6, 8, 7, 10] },
    { key: "pendingSubmissions", value: 18, deltaPct: -22, sparkline: [10, 9, 11, 8, 9, 7, 8, 5] },
    { key: "upcomingInterviews", value: 12, deltaPct: 33, sparkline: [4, 4, 5, 6, 6, 8, 9, 11] },
    { key: "overdueFollowups", value: 6, deltaPct: -40, sparkline: [10, 9, 10, 8, 9, 6, 7, 4] },
  ],
  talent: [
    { id: 1, name: "Alex Morgan", primarySkill: "Java Developer", availability: { label: "Available", tone: "green" }, resume: { label: "Updated", state: "UPDATED" }, activeApps: 3, nextAction: { label: "Submit to Job", tone: "blue" } },
    { id: 2, name: "Priya Sharma", primarySkill: "Business Analyst", availability: { label: "2 weeks", tone: "amber" }, resume: { label: "Updated", state: "UPDATED" }, activeApps: 5, nextAction: { label: "Review Matches", tone: "blue" } },
    { id: 3, name: "Michael Park", primarySkill: "AWS Engineer", availability: { label: "Available", tone: "green" }, resume: { label: "Updated", state: "UPDATED" }, activeApps: 2, nextAction: { label: "Follow Up", tone: "violet" } },
    { id: 4, name: "Emily Lawson", primarySkill: "Project Manager", availability: { label: "1 month", tone: "blue" }, resume: { label: "Needs Update", state: "NEEDS_UPDATE" }, activeApps: 1, nextAction: { label: "Request Resume", tone: "red" } },
    { id: 5, name: "David Kim", primarySkill: "Data Analyst", availability: { label: "Available", tone: "green" }, resume: { label: "Updated", state: "UPDATED" }, activeApps: 4, nextAction: { label: "Schedule Interview", tone: "blue" } },
  ],
  streams: [
    { source: "LinkedIn Jobs", status: "Active", newOpenings: 124, lastSyncAt: ago(10 * MIN) },
    { source: "Indeed", status: "Active", newOpenings: 86, lastSyncAt: ago(25 * MIN) },
    { source: "Dice", status: "Active", newOpenings: 48, lastSyncAt: ago(1 * H) },
    { source: "ZipRecruiter", status: "Active", newOpenings: 32, lastSyncAt: ago(2 * H) },
    { source: "Client Portal", status: "Active", newOpenings: 67, lastSyncAt: ago(30 * MIN) },
  ],
  openings: [
    { id: 11, title: "Senior Java Developer", client: "TechCorp", location: "New York, NY", matchPct: 92 },
    { id: 12, title: "Data Analyst", client: "Global Bank", location: "Remote", matchPct: 88 },
    { id: 13, title: "AWS Cloud Engineer", client: "CloudScale", location: "Austin, TX", matchPct: 85 },
    { id: 14, title: "Business Analyst", client: "HealthPlus", location: "Chicago, IL", matchPct: 82 },
    { id: 15, title: "Project Manager (PMP)", client: "NextGen", location: "Remote", matchPct: 78 },
  ],
  pipeline: {
    total: 362,
    deltaPct: 18,
    stages: [
      { key: "review", label: "Review", count: 142, pct: 32 },
      { key: "submitted", label: "Submitted", count: 108, pct: 25 },
      { key: "interviewing", label: "Interviewing", count: 64, pct: 15 },
      { key: "offer", label: "Offer", count: 28, pct: 7 },
      { key: "placed", label: "Placed", count: 20, pct: 5 },
    ],
  },
  tasks: [
    { id: 1, title: "Follow up with TechCorp recruiter", sub: "Alex Morgan - Java Developer", dueAt: at(9, 0), kind: "CALL", done: false },
    { id: 2, title: "Send updated resume to HealthPlus", sub: "Priya Sharma - Business Analyst", dueAt: at(11, 0), kind: "EMAIL", done: false },
    { id: 3, title: "Check interview feedback", sub: "Michael Park - AWS Engineer", dueAt: at(13, 0), kind: "CHAT", done: false },
    { id: 4, title: "Follow up on application status", sub: "David Kim - Data Analyst", dueAt: at(15, 0), kind: "CALL", done: false },
    { id: 5, title: "Update consultant on next steps", sub: "Emily Lawson - Project Manager", dueAt: at(16, 30), kind: "DOC", done: false },
  ],
  interviews: [
    { id: 1, startsAt: at(10, 0), consultant: "Alex Morgan", role: "Java Developer", client: "TechCorp", type: "1st Round", status: "Confirmed" },
    { id: 2, startsAt: at(11, 30), consultant: "Priya Sharma", role: "Business Analyst", client: "Global Bank", type: "Client Interview", status: "Confirmed" },
    { id: 3, startsAt: at(14, 0), consultant: "Michael Park", role: "AWS Engineer", client: "CloudScale", type: "Technical", status: "Confirmed" },
    { id: 4, startsAt: at(16, 0), consultant: "David Kim", role: "Data Analyst", client: "NextGen", type: "Final Round", status: "Confirmed" },
  ],
  activity: [
    { id: 1, actor: "Emily Lawson", text: "updated resume", detail: "Resume updated with new certifications", at: ago(2 * H) },
    { id: 2, actor: "Michael Park", text: "submitted to Senior AWS Engineer at CloudScale", detail: "Application submitted successfully", at: ago(4 * H) },
    { id: 3, actor: "Alex Morgan", text: "interview scheduled with TechCorp", detail: "1st round interview on Jun 25, 2024 at 10:00 AM", at: ago(6 * H) },
    { id: 4, actor: "Priya Sharma", text: "matched to 3 new openings", detail: "New job matches found based on skills and preferences", at: ago(24 * H) },
  ],
});

export function createMarketingHomeMock({ json, subOf = () => null }) {
  return function handle(req, res, path, method) {
    const m = /^\/api\/orgs\/(\d+)\/me-workspace\/marketing\/home$/.exec(path);
    if (!m) return false;
    req.resume();
    const login = subOf(req);
    if (Number(m[1]) !== 2 || !login || !MEMBERS.has(login)) return json(res, 404, { status: 404, code: "NOT_FOUND" }), true;
    if (method !== "GET") return json(res, 405, { status: 405 }), true;
    return json(res, 200, view()), true;
  };
}

/**
 * Dev mock for `/api/orgs/{orgId}/mkt/matches` (Marketing workspace, Job Matches), in memory, DEV ONLY. The first ten rows, the four KPI
 * numbers, "Top Matches Today", the explanation and the insight bars are the approved "Job Matches" board; 132 more rows fill the
 * "of 142 matches" paging (so the first page equals the board). Only acme (id 2) members who hold the marketing grants see it.
 * Assign / Dismiss change the in-memory row only (a record, never a submission: E1).
 */
const MEMBERS = new Set(["marketer@acme.com", "sarah@acme.com", "demo-ent-acme-omar", "demo-ent-acme-sarah"]);
const DAY = 864e5;
const ago = (days) => new Date(Date.now() - days * DAY).toISOString();

const FIT = {
  Excellent: { key: "EXCELLENT", label: "Excellent", tone: "green", pct: 100 },
  Good: { key: "GOOD", label: "Good", tone: "blue", pct: 85 },
  Fair: { key: "FAIR", label: "Fair", tone: "amber", pct: 60 },
};
const BOARD = [
  ["Alex Morgan", "Java Developer", "Java", "Senior Java Developer", "TechCorp", 96, "Excellent", false],
  ["Priya Sharma", "Business Analyst", "Business Analysis", "Business Analyst", "Global Bank", 92, "Excellent", true],
  ["Michael Park", "AWS Engineer", "AWS", "Cloud Engineer", "CloudScale", 89, "Good", false],
  ["Emily Lawson", "Project Manager", "Project Management", "IT Project Manager", "HealthPlus", 87, "Excellent", true],
  ["David Kim", "Data Analyst", "SQL", "Data Analyst", "DataWorks", 85, "Good", false],
  ["Sophie Turner", "DevOps Engineer", "DevOps", "DevOps Engineer", "FinServe", 82, "Fair", true],
  ["James Wilson", "Full Stack Developer", "React", "Full Stack Developer", "NextGen", 78, "Good", true],
  ["Anita Desai", "QA Engineer", "QA Automation", "QA Automation Engineer", "RetailCo", 76, "Excellent", false],
  ["Robert Chen", "Salesforce Consultant", "Salesforce", "Salesforce Developer", "Client Portal", 72, "Fair", true],
  ["Lisa Gomez", "UI/UX Designer", "UI/UX", "UI/UX Designer", "MediaHub", 68, "Fair", true],
];
const CLIENT_IDS = {};
const clientId = (name) => (CLIENT_IDS[name] ??= 500 + Object.keys(CLIENT_IDS).length);
const consultantIds = {};
const consultantId = (name) => (consultantIds[name] ??= 10 + Object.keys(consultantIds).length);

const rows = [];
BOARD.forEach(([name, role, skill, job, client, score, fit, update], i) =>
  rows.push(mk(i + 1, name, role, skill, job, client, score, fit, update, i === 1 || i === 3 || i === 6 ? 9 : 2)),
);
function mk(id, name, role, skill, job, client, score, fit, update, daysOld) {
  return {
    id, consultantId: consultantId(name), consultantName: name, avatarUrl: null, consultantRole: role, primarySkill: skill,
    requirementId: 100 + id, jobTitle: job, clientId: clientId(client), client, score, status: "SUGGESTED", stale: daysOld > 7,
    highConfidence: score >= 85, availability: FIT[fit],
    resumeUpdate: update ? { needed: true, reasons: [`Add to resume: ${skill}`] } : { needed: false, reasons: [] },
    createdAt: ago(daysOld),
  };
}
for (let i = 0; i < 132; i++) {
  const b = BOARD[i % BOARD.length];
  const high = i < 73;
  const score = high ? 85 + ((i * 7) % 11) : 60 + ((i * 5) % 25);
  const fit = ["Excellent", "Good", "Fair"][i % 3];
  rows.push(mk(11 + i, b[0], b[1], b[2], b[3] + (i >= 10 ? ` ${Math.floor(i / 10) + 1}` : ""), b[4], score, fit, i % 3 === 1, 1 + (i % 12)));
}

const KPIS = [
  { key: "matched", value: 142, deltaPct: 24, sparkline: [60, 72, 80, 95, 101, 118, 130, 142] },
  { key: "highConfidence", value: 78, deltaPct: 31, sparkline: [30, 38, 41, 50, 55, 62, 70, 78] },
  { key: "ready", value: 56, deltaPct: 18, sparkline: [28, 30, 35, 36, 42, 45, 50, 56] },
  { key: "stale", value: 20, deltaPct: -35, sparkline: [30, 26, 28, 24, 25, 22, 21, 20] },
];

const detail = (row) => {
  const alex = row.id === 1;
  return {
    row,
    consultant: { id: row.consultantId, name: row.consultantName, role: row.consultantRole, avatarUrl: null, skills: alex ? ["Java", "Spring Boot", "Microservices", "AWS"] : [row.primarySkill] },
    job: { id: row.requirementId, title: row.jobTitle, client: row.client, location: "New York, NY", skills: alex ? ["Java", "Spring Boot", "AWS", "REST APIs"] : [row.primarySkill] },
    ticks: alex
      ? [
          { key: "skills", ok: true, text: "8 of 9 required skills match" },
          { key: "experience", ok: true, text: "5+ years of relevant experience" },
          { key: "availability", ok: true, text: "Available to start within 2 weeks" },
          { key: "location", ok: true, text: "Work location matches (New York, NY)" },
          { key: "client", ok: true, text: "Strong client fit based on past applications (2 of 2 progressed)" },
        ]
      : [
          { key: "skills", ok: row.score >= 80, text: `${Math.round(row.score / 12)} of 9 required skills match` },
          { key: "availability", ok: row.availability.pct >= 85, text: row.availability.pct >= 85 ? "Available to start within 2 weeks" : "Available in about 4 weeks" },
        ],
    insights: [
      { key: "skills", label: "Skills Match", pct: alex ? 92 : row.score },
      { key: "experience", label: "Experience Level", pct: alex ? 88 : Math.max(40, row.score - 6) },
      { key: "availability", label: "Availability Fit", pct: alex ? 85 : row.availability.pct },
      { key: "client", label: "Client History", pct: alex ? 78 : null },
      { key: "location", label: "Location Fit", pct: alex ? 90 : 75 },
    ],
    missingSkills: alex ? ["REST APIs"] : [],
    reason: "Rule match",
    assignedAt: row.status === "ASSIGNED" ? ago(0) : null,
  };
};

const FILTERS = () => ({
  consultants: Object.entries(consultantIds).map(([label, key]) => ({ key: String(key), label })),
  skills: [...new Set(rows.map((r) => r.primarySkill))].sort(),
  clients: Object.entries(CLIENT_IDS).map(([label, key]) => ({ key: String(key), label })),
  scores: [{ key: "high", label: "High confidence (85%+)" }, { key: "mid", label: "70% - 84%" }, { key: "low", label: "Below 70%" }],
});

function list(sp) {
  const page = Math.max(0, Number(sp.get("page") ?? 0));
  const size = Math.min(100, Math.max(1, Number(sp.get("size") ?? 10)));
  const score = sp.get("score");
  let f = rows.filter((r) => r.status !== "DISMISSED");
  if (sp.get("consultantId")) f = f.filter((r) => String(r.consultantId) === sp.get("consultantId"));
  if (sp.get("clientId")) f = f.filter((r) => String(r.clientId) === sp.get("clientId"));
  if (sp.get("skill")) f = f.filter((r) => r.primarySkill.toLowerCase() === sp.get("skill").toLowerCase());
  if (score === "high") f = f.filter((r) => r.score >= 85);
  if (score === "mid") f = f.filter((r) => r.score >= 70 && r.score < 85);
  if (score === "low") f = f.filter((r) => r.score < 70);
  const q = (sp.get("q") ?? "").toLowerCase();
  if (q) f = f.filter((r) => `${r.consultantName} ${r.jobTitle} ${r.client}`.toLowerCase().includes(q));
  f = [...f].sort((a, b) => b.score - a.score || a.id - b.id);
  const items = f.slice(page * size, page * size + size);
  const sel = rows.find((r) => String(r.id) === sp.get("selected")) ?? items[0] ?? null;
  return {
    kpis: KPIS, filters: FILTERS(), items, total: f.length, page, size,
    topToday: rows.slice(0, 5), explanation: sel ? detail(sel) : null, highConfidenceMin: 85, staleDays: 7,
  };
}

export function createMktMatchesMock({ json, subOf = () => null }) {
  return function handle(req, res, path, method) {
    const m = /^\/api\/orgs\/(\d+)\/mkt\/matches(?:\/(compare|\d+)(?:\/(assign|dismiss))?)?$/.exec(path.split("?")[0]);
    if (!m) return false;
    req.resume();
    const login = subOf(req);
    if (Number(m[1]) !== 2 || !login || !MEMBERS.has(login)) return json(res, 404, { status: 404, code: "NOT_FOUND" }), true;
    const sp = new URL(req.url ?? path, "http://mock").searchParams;
    const [, , seg, act] = m;
    if (!seg) return method === "GET" ? (json(res, 200, list(sp)), true) : (json(res, 405, { status: 405 }), true);
    if (seg === "compare") {
      const a = rows.find((r) => String(r.id) === sp.get("a"));
      const b = rows.find((r) => String(r.id) === sp.get("b"));
      return a && b ? (json(res, 200, { a: detail(a), b: detail(b) }), true) : (json(res, 404, { status: 404, code: "NOT_FOUND" }), true);
    }
    const row = rows.find((r) => String(r.id) === seg);
    if (!row) return json(res, 404, { status: 404, code: "NOT_FOUND" }), true;
    if (!act) return method === "GET" ? (json(res, 200, detail(row)), true) : (json(res, 405, { status: 405 }), true);
    if (method !== "POST") return json(res, 405, { status: 405 }), true;
    if (act === "assign") {
      if (row.status === "DISMISSED") return json(res, 409, { status: 409, code: "MATCH_STATE", message: "Only a suggested match can be assigned" }), true;
      row.status = "ASSIGNED";
    } else {
      if (row.status === "ASSIGNED") return json(res, 409, { status: 409, code: "MATCH_STATE", message: "Only a suggested match can be dismissed" }), true;
      row.status = "DISMISSED";
    }
    return json(res, 200, row), true;
  };
}

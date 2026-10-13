/**
 * Dev mock for `/api/orgs/{orgId}/mkt/applications` (Marketing workspace), in memory, DEV ONLY. The rows are the approved
 * "Applications" board so the page can be compared to it side by side; the filters (q, consultantId, clientId, stage, sort) work on
 * those rows, the tab counts and KPIs are the board's numbers. The four writes (note, next action, follow-up done, stage record) change
 * the in-memory row and answer it, like the API; none of them submits anything (E1). Only acme (id 2) members who hold the marketing
 * grants see it; anyone else gets the API's 404.
 */
const MEMBERS = new Set(["marketer@acme.com", "sarah@acme.com", "demo-ent-acme-omar", "demo-ent-acme-sarah"]);
const ago = (ms) => new Date(Date.now() - ms).toISOString();
const H = 3600e3;
const DAY = 24 * H;
const P = "/ent/marketer/applications";

const STAGES = {
  applied: "Applied", awaiting: "Awaiting Response", interviewing: "Interviewing", offer: "Offer", hired: "Hired", not_selected: "Not Selected",
};
const person = (id, name, slug) => ({ id, name, avatarUrl: `${P}/${slug}.png` });
const owners = { sarah: person(7, "Sarah Chen", "sarah-chen"), michael: person(8, "Michael Park", "michael-park"), emily: person(9, "Emily Lawson", "emily-lawson"), priya: person(10, "Priya Sharma", "priya-sharma") };
const consultant = (id, name, slug) => ({ id, name, avatarUrl: `${P}/${slug}.png`, consent: "FULL" });

const rows = [
  { id: 1, c: consultant(1, "Alex Morgan", "alex-morgan"), role: "Senior Java Developer", client: "TechCorp", clientId: 1, source: "LinkedIn", appliedOn: "2024-04-12", stage: "interviewing", owner: owners.sarah, nextAction: "Prep for technical interview", due: "2024-04-18" },
  { id: 2, c: consultant(2, "Priya Sharma", "priya-sharma"), role: "Business Analyst", client: "Global Bank", clientId: 2, source: "Client Portal", appliedOn: "2024-04-10", stage: "awaiting", owner: owners.michael, nextAction: "Follow up with hiring manager", due: "2024-04-17" },
  { id: 3, c: consultant(3, "Michael Park", "michael-park"), role: "AWS Engineer", client: "CloudScale", clientId: 3, source: "Dice", appliedOn: "2024-04-08", stage: "applied", owner: owners.emily, nextAction: "Check application status", due: "2024-04-16" },
  { id: 4, c: consultant(4, "Emily Lawson", "emily-lawson"), role: "Project Manager", client: "HealthPlus", clientId: 4, source: "ZipRecruiter", appliedOn: "2024-04-05", stage: "interviewing", owner: owners.sarah, nextAction: "Panel interview feedback", due: "2024-04-18" },
  { id: 5, c: consultant(5, "David Kim", "david-kim"), role: "Data Analyst", client: "DataWorx", clientId: 5, source: "Indeed", appliedOn: "2024-04-03", stage: "offer", owner: owners.priya, nextAction: "Send offer details to consultant", due: "2024-04-15" },
  { id: 6, c: consultant(6, "Sophia Patel", "sophia-patel"), role: "DevOps Engineer", client: "NextGen", clientId: 6, source: "Referral", appliedOn: "2024-04-01", stage: "awaiting", owner: owners.michael, nextAction: "Follow up with client", due: "2024-04-17" },
  { id: 7, c: consultant(7, "Daniel Wu", "daniel-wu"), role: "Cloud Architect", client: "InnovateTech", clientId: 7, source: "Company Website", appliedOn: "2024-03-29", stage: "applied", owner: owners.emily, nextAction: "Review client requirements", due: "2024-04-16" },
  { id: 8, c: consultant(8, "Olivia Martinez", "olivia-martinez"), role: "UX Designer", client: "BrightPath", clientId: 8, source: "LinkedIn", appliedOn: "2024-03-27", stage: "not_selected", owner: owners.sarah, nextAction: "Share feedback with consultant", due: "2024-04-12" },
];
const notes = [];

const rowOut = (r) => ({
  id: r.id, code: `APP-2024-${String(r.id).padStart(3, "0")}`, consultant: r.c, role: r.role, client: r.client, source: r.source, appliedOn: r.appliedOn,
  stage: { key: r.stage, label: STAGES[r.stage] }, owner: r.owner, nextAction: r.nextAction, nextActionDue: r.due,
});

const kpi = (key, value, deltaPct, sparkline) => ({ key, value, deltaPct, sparkline });
const tabs = (counts) => [{ key: "all", label: "All Applications", count: counts.all }, ...Object.keys(STAGES).map((k) => ({ key: k, label: STAGES[k], count: counts[k] }))];
const COUNTS = { all: 142, applied: 44, awaiting: 68, interviewing: 28, offer: 12, hired: 8, not_selected: 15 };

function board(url) {
  const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
  const stage = url.searchParams.get("stage");
  const consultantId = url.searchParams.get("consultantId");
  const clientId = url.searchParams.get("clientId");
  const asc = (url.searchParams.get("sort") ?? "").endsWith(",asc");
  let list = rows.filter((r) => (!q || [r.c.name, r.role, r.client, r.source].some((s) => s.toLowerCase().includes(q))) && (!consultantId || String(r.c.id) === consultantId) && (!clientId || String(r.clientId) === clientId));
  const filtered = list.length;
  if (stage && STAGES[stage]) list = list.filter((r) => r.stage === stage);
  list = [...list].sort((a, b) => (asc ? a.appliedOn.localeCompare(b.appliedOn) : b.appliedOn.localeCompare(a.appliedOn)));
  const unfiltered = !q && !consultantId && !clientId;
  return {
    kpis: [
      kpi("active", 142, 12, [96, 104, 110, 118, 121, 130, 136, 142]),
      kpi("awaiting", 68, 8, [48, 50, 55, 53, 58, 61, 64, 68]),
      kpi("interviewing", 28, 27, [14, 17, 16, 20, 21, 24, 25, 28]),
      kpi("offers", 12, 33, [5, 7, 6, 8, 7, 10, 9, 12]),
    ],
    tracker: {
      items: list.map(rowOut),
      total: unfiltered ? (stage && STAGES[stage] ? COUNTS[stage] : COUNTS.all) : list.length,
      page: 0,
      size: 8,
      tabs: tabs(unfiltered ? COUNTS : { all: filtered, applied: 0, awaiting: 0, interviewing: 0, offer: 0, hired: 0, not_selected: 0 }),
      filters: {
        consultants: rows.map((r) => ({ id: r.c.id, name: r.c.name })).sort((a, b) => a.name.localeCompare(b.name)),
        clients: rows.map((r) => ({ id: r.clientId, name: r.client })).sort((a, b) => a.name.localeCompare(b.name)),
      },
      notShared: 0,
    },
    funnel: {
      period: url.searchParams.get("funnelPeriod") ?? "3m",
      total: 142,
      stages: [
        { key: "applied", label: "Applied", count: 142, pct: 100 },
        { key: "awaiting", label: "Awaiting Response", count: 68, pct: 48 },
        { key: "interviewing", label: "Interviewing", count: 28, pct: 20 },
        { key: "offers", label: "Offers", count: 12, pct: 8 },
        { key: "hired", label: "Hired", count: 8, pct: 6 },
      ],
    },
    overdue: [
      { id: 1, consultant: rows[0].c, title: "Follow up with TechCorp", sub: "Application response pending", daysOverdue: 3 },
      { id: 2, consultant: rows[1].c, title: "Check interview feedback", sub: "Global Bank - Business Analyst", daysOverdue: 2 },
      { id: 3, consultant: rows[2].c, title: "Update application status", sub: "CloudScale - AWS Engineer", daysOverdue: 5 },
      { id: 4, consultant: rows[3].c, title: "Send thank you note", sub: "HealthPlus - Project Manager", daysOverdue: 1 },
      { id: 6, consultant: rows[5].c, title: "Follow up with hiring manager", sub: "NextGen - DevOps Engineer", daysOverdue: 4 },
    ].filter((o) => rows.some((r) => r.id === o.id && r.nextAction)),
    overdueTotal: 5,
    updates: [
      { id: 1, applicationId: 5, consultant: rows[4].c, text: "moved to Offer", detail: "Data Analyst at DataWorx", at: ago(1 * H), tone: "green" },
      { id: 2, applicationId: 4, consultant: rows[3].c, text: "completed interview", detail: "Project Manager at HealthPlus", at: ago(3 * H), tone: "amber" },
      { id: 3, applicationId: 2, consultant: rows[1].c, text: "application viewed", detail: "Business Analyst at Global Bank", at: ago(5 * H), tone: "violet" },
      { id: 4, applicationId: 1, consultant: rows[0].c, text: "interview scheduled", detail: "Senior Java Developer at TechCorp", at: ago(1 * DAY), tone: "blue" },
      { id: 5, applicationId: 6, consultant: rows[5].c, text: "moved to Interviewing", detail: "DevOps Engineer at NextGen", at: ago(1 * DAY + H), tone: "green" },
    ],
    perms: { followups: true, record: true },
  };
}

const readBody = (req) =>
  new Promise((resolve) => {
    let s = "";
    req.on("data", (c) => (s += c));
    req.on("end", () => {
      try {
        resolve(JSON.parse(s || "{}"));
      } catch {
        resolve({});
      }
    });
  });

export function createMktApplicationsMock({ json, subOf = () => null }) {
  return function handle(req, res, path, method) {
    const m = /^\/api\/orgs\/(\d+)\/mkt\/applications(?:\/(\d+)\/(notes|next-action|follow-up-done|stage))?$/.exec(path);
    if (!m) return false;
    const login = subOf(req);
    if (Number(m[1]) !== 2 || !login || !MEMBERS.has(login)) return req.resume(), json(res, 404, { status: 404, code: "NOT_FOUND" }), true;
    if (!m[2]) {
      req.resume();
      if (method !== "GET") return json(res, 405, { status: 405 }), true;
      return json(res, 200, board(new URL(req.url, "http://mock"))), true;
    }
    if (method !== (m[3] === "next-action" ? "PATCH" : "POST")) return req.resume(), json(res, 405, { status: 405 }), true;
    const row = rows.find((r) => r.id === Number(m[2]));
    void readBody(req).then((b) => {
      if (!row) return json(res, 404, { status: 404, code: "NOT_FOUND" });
      if (m[3] === "notes") {
        if (!String(b.body ?? "").trim()) return json(res, 400, { status: 400, title: "body is required" });
        notes.push({ id: row.id, body: String(b.body).trim() });
      } else if (m[3] === "next-action") {
        row.nextAction = String(b.nextAction ?? "").trim() || null;
        row.due = row.nextAction ? (b.dueDate ?? null) : null;
      } else if (m[3] === "follow-up-done") {
        if (!row.nextAction) return json(res, 400, { status: 400, title: "there is no follow-up to complete" });
        row.nextAction = null;
        row.due = null;
      } else if (m[3] === "stage") {
        if (!STAGES[b.stage]) return json(res, 400, { status: 400, title: "stage is not a stage of the board" });
        row.stage = b.stage;
      }
      return json(res, 200, rowOut(row));
    });
    return true;
  };
}

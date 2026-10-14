/**
 * Dev mock for `/api/orgs/{orgId}/mkt/opportunities/**` (Marketing workspace), in memory, DEV ONLY. The rows are the approved
 * "Opportunities" board, so the page can be compared to it side by side. Only acme (id 2) members who hold the marketing grants see it.
 * E1: nothing here sets a consultant's interest; "assign" and "request" only mark the request, like the real API.
 */
const MEMBERS = new Set(["marketer@acme.com", "sarah@acme.com", "demo-ent-acme-omar", "demo-ent-acme-sarah"]);
const ART = "/ent/marketer/opportunities";
const DAY = 86_400_000;
const ago = (ms) => new Date(Date.now() - ms).toISOString();
const inDays = (d) => new Date(Date.now() + d * DAY).toISOString();

const people = {
  alex: { id: 1, name: "Alex Morgan", avatarUrl: `${ART}/alex-morgan.png` },
  priya: { id: 2, name: "Priya Sharma", avatarUrl: `${ART}/priya-sharma.png` },
  michael: { id: 3, name: "Michael Park", avatarUrl: `${ART}/michael-park.png` },
  emily: { id: 4, name: "Emily Lawson", avatarUrl: `${ART}/emily-lawson.png` },
  david: { id: 5, name: "David Kim", avatarUrl: `${ART}/david-kim.png` },
  jessica: { id: 6, name: "Jessica Wong", avatarUrl: `${ART}/jessica-wong.png` },
  robert: { id: 7, name: "Robert Chen", avatarUrl: `${ART}/robert-chen.png` },
  maria: { id: 8, name: "Maria Garcia", avatarUrl: `${ART}/maria-garcia.png` },
};
const owners = {
  sarah: { id: 101, name: "Sarah Chen", avatarUrl: `${ART}/sarah-chen.png` },
  james: { id: 102, name: "James Lee", avatarUrl: `${ART}/james-lee.png` },
  david: { id: 103, name: "David Kim", avatarUrl: `${ART}/david-kim-owner.png` },
};

const row = (id, who, req, title, location, clientId, client, score, interest, resume, owner, next, action, status, lastDaysAgo) => ({
  id, consultant: people[who], requirementId: req, jobTitle: title, location, clientId, client, matchScore: score, interest, resumeStatus: resume,
  owner: owners[owner], nextActionAt: inDays(next), action, status, lastActivityAt: ago(lastDaysAgo * DAY), stale: lastDaysAgo >= 14, ready: status === "SUGGESTED" && resume === "UPDATED" && interest !== "NOT_INTERESTED", reason: "Skills and rate band match the role.",
});

let rows = [
  row(1, "alex", 11, "Senior Java Developer", "New York, NY (Hybrid)", 1, "TechCorp", 92, "VERY_INTERESTED", "UPDATED", "sarah", 1, "REVIEW", "ASSIGNED", 1),
  row(2, "priya", 12, "Data Analyst", "Remote", 2, "Global Bank", 88, "INTERESTED", "UPDATED", "james", 2, "ASSIGN", "SUGGESTED", 2),
  row(3, "michael", 13, "AWS Cloud Engineer", "Austin, TX (Hybrid)", 3, "CloudScale", 85, "OPEN", "NEEDS_UPDATE", "sarah", 0, "FOLLOW_UP", "ASSIGNED", 3),
  row(4, "emily", 14, "Project Manager (PMP)", "Remote", 4, "NextGen", 78, "VERY_INTERESTED", "UPDATED", "david", 3, "REVIEW", "ASSIGNED", 1),
  row(5, "david", 15, "Business Analyst", "Chicago, IL (Hybrid)", 5, "HealthPlus", 82, "INTERESTED", "UPDATED", "james", 1, "ASSIGN", "SUGGESTED", 2),
  row(6, "jessica", 16, "DevOps Engineer", "Seattle, WA (Remote)", 6, "DataSystems", 76, "NOT_INTERESTED", "UPDATED", "sarah", 5, "COMPARE", "ASSIGNED", 4),
  row(7, "robert", 17, "Full Stack Developer", "San Francisco, CA (Hybrid)", 7, "FinTech Co", 80, "INTERESTED", "NEEDS_UPDATE", "david", 2, "FOLLOW_UP", "ASSIGNED", 16),
  row(8, "maria", 18, "Product Owner", "New York, NY (Hybrid)", 8, "RetailPro", 74, "OPEN", "UPDATED", "sarah", 4, "ASSIGN", "SUGGESTED", 15),
];

const kpis = () => [
  { key: "open", value: 86, deltaPct: 12, sparkline: [60, 64, 66, 70, 74, 78, 82, 86] },
  { key: "ready", value: rows.filter((r) => r.ready).length + 25, deltaPct: 18, sparkline: [14, 16, 18, 19, 22, 23, 26, 28] },
  { key: "awaiting", value: 42, deltaPct: -10, sparkline: [50, 52, 49, 48, 47, 45, 44, 42] },
  { key: "stale", value: 14, deltaPct: -22, sparkline: [20, 19, 18, 18, 17, 16, 15, 14] },
];

const topMatches = [
  { id: 1, jobTitle: "Senior Java Developer", client: "TechCorp", location: "New York, NY", matchScore: 92 },
  { id: 2, jobTitle: "Data Analyst", client: "Global Bank", location: "Remote", matchScore: 88 },
  { id: 3, jobTitle: "AWS Cloud Engineer", client: "CloudScale", location: "Austin, TX", matchScore: 85 },
  { id: 5, jobTitle: "Business Analyst", client: "HealthPlus", location: "Chicago, IL", matchScore: 82 },
  { id: 7, jobTitle: "Full Stack Developer", client: "FinTech Co", location: "San Francisco, CA", matchScore: 80 },
];
const responses = () => ({
  total: 86,
  days: 30,
  slices: [
    { key: "VERY_INTERESTED", label: "Very Interested", count: 28 },
    { key: "INTERESTED", label: "Interested", count: 24 },
    { key: "OPEN", label: "Open", count: 17 },
    { key: "NOT_INTERESTED", label: "Not Interested", count: 10 },
    { key: "NO_RESPONSE", label: "No Response", count: 7 },
  ],
});
let activity = [
  { id: 1, kind: "INTEREST_CHANGED", consultant: "Alex Morgan", text: "marked as Very Interested", detail: "Senior Java Developer at TechCorp", at: ago(2 * 3600e3) },
  { id: 2, kind: "REVIEWED", consultant: "Priya Sharma", text: "reviewed opportunity", detail: "Data Analyst at Global Bank", at: ago(4 * 3600e3) },
  { id: 3, kind: "RESUME_REQUESTED", consultant: "Michael Park", text: "requested resume update", detail: "AWS Cloud Engineer at CloudScale", at: ago(6 * 3600e3) },
  { id: 4, kind: "ASSIGNED", consultant: "David Kim", text: "assigned to opportunity", detail: "Business Analyst at HealthPlus", at: ago(DAY) },
  { id: 5, kind: "RESUME_UPDATED", consultant: "Emily Lawson", text: "submitted updated resume", detail: "Project Manager at NextGen", at: ago(DAY + 3600e3) },
];

const csvCell = (s) => (/[",\n]/.test(String(s)) ? `"${String(s).replaceAll('"', '""')}"` : String(s));

function readBody(req) {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
  });
}

function filtered(url) {
  const q = (url.searchParams.get("q") ?? "").toLowerCase();
  const interest = url.searchParams.get("interest");
  const consultantId = url.searchParams.get("consultantId");
  const clientId = url.searchParams.get("clientId");
  const minScore = Number(url.searchParams.get("minScore") ?? 0);
  const stale = url.searchParams.get("stale") === "true";
  const ready = url.searchParams.get("ready") === "true";
  let out = rows.filter(
    (r) =>
      (!q || r.consultant.name.toLowerCase().includes(q) || r.jobTitle.toLowerCase().includes(q)) &&
      (!interest || r.interest === interest) &&
      (!consultantId || String(r.consultant.id) === consultantId) &&
      (!clientId || String(r.clientId) === clientId) &&
      r.matchScore >= minScore &&
      (!stale || r.stale) &&
      (!ready || r.ready),
  );
  const sort = url.searchParams.get("sort") ?? "recent";
  const dir = url.searchParams.get("dir") === "asc" ? 1 : -1;
  if (sort === "score") out = [...out].sort((a, b) => dir * (a.matchScore - b.matchScore));
  if (sort === "consultant") out = [...out].sort((a, b) => dir * a.consultant.name.localeCompare(b.consultant.name));
  if (sort === "client") out = [...out].sort((a, b) => dir * a.client.localeCompare(b.client));
  return out;
}

export function createMktOpportunitiesMock({ json, subOf = () => null }) {
  return function handle(req, res, path, method) {
    const m = /^\/api\/orgs\/(\d+)\/mkt\/opportunities(?:\/(export|options|notify|bulk-assign|\d+)(?:\/(assign|request|review|next-action))?)?$/.exec(path);
    if (!m) return false;
    const login = subOf(req);
    if (Number(m[1]) !== 2 || !login || !MEMBERS.has(login)) {
      req.resume();
      return json(res, 404, { status: 404, code: "NOT_FOUND" }), true;
    }
    const url = new URL(req.url ?? path, "http://mock.local");
    const [, , seg, act] = m;
    const id = seg && /^\d+$/.test(seg) ? Number(seg) : null;
    const row = id === null ? null : rows.find((r) => r.id === id);

    if (method === "GET" && !seg) {
      req.resume();
      const all = filtered(url);
      const size = Math.min(100, Number(url.searchParams.get("size") ?? 8) || 8);
      const page = Math.max(0, Number(url.searchParams.get("page") ?? 0) || 0);
      return json(res, 200, {
        kpis: kpis(), items: all.slice(page * size, page * size + size), total: all.length, page, size, topMatches, responses: responses(), activity,
        filters: { consultants: Object.values(people).map(({ id: i, name }) => ({ id: i, name })), clients: rows.map((r) => ({ id: r.clientId, name: r.client })) },
      }), true;
    }
    if (method === "GET" && seg === "export") {
      req.resume();
      const body = ["Consultant,Job Title,Client,Location,Match Score,Consultant Interest,Resume Status,Owner,Status", ...filtered(url).map((r) => [r.consultant.name, r.jobTitle, r.client, r.location, r.matchScore, r.interest, r.resumeStatus, r.owner.name, r.status].map(csvCell).join(","))].join("\r\n");
      res.writeHead(200, { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="opportunities.csv"' });
      return res.end(body), true;
    }
    if (method === "GET" && seg === "options") {
      req.resume();
      return json(res, 200, { consultants: Object.values(people).map(({ id: i, name }) => ({ id: i, name })), jobs: rows.map((r) => ({ id: r.requirementId, title: r.jobTitle, client: r.client, location: r.location })) }), true;
    }
    if (method === "GET" && row) {
      req.resume();
      return json(res, 200, { item: row, alternatives: rows.filter((r) => r.consultant.id === row.consultant.id && r.id !== row.id), events: activity.filter((a) => a.consultant === row.consultant.name) }), true;
    }
    if (method === "GET") {
      req.resume();
      return json(res, 404, { status: 404, code: "NOT_FOUND" }), true;
    }

    return void readBody(req).then((body) => {
      if (seg === "notify") return json(res, 200, { done: 3, skipped: [], message: "Asked 3 consultants for their interest." });
      if (seg === "bulk-assign") {
        const ids = Array.isArray(body.ids) ? body.ids : [];
        rows = rows.map((r) => (ids.includes(r.id) ? { ...r, status: "ASSIGNED", ready: false, action: "REVIEW" } : r));
        return json(res, 200, { done: ids.length, skipped: [], message: `Assigned ${ids.length} opportunities.` });
      }
      if (!seg && method === "POST") return json(res, 200, { item: rows[0], message: "Opportunity added.", changed: true });
      if (!row) return json(res, 404, { status: 404, code: "NOT_FOUND" });
      if (act === "assign") {
        if (row.status === "ASSIGNED") return json(res, 409, { code: "ALREADY_ASSIGNED", error: "This opportunity is already assigned." });
        Object.assign(row, { status: "ASSIGNED", ready: false, action: "REVIEW", lastActivityAt: new Date().toISOString() });
        return json(res, 200, { item: row, message: `Assigned. ${row.consultant.name} was asked for their interest.`, changed: true });
      }
      if (act === "request") return json(res, 200, { item: row, message: body.kind === "RESUME" ? `Asked ${row.consultant.name} to update their resume.` : `Asked ${row.consultant.name} for their interest.`, changed: true });
      if (act === "review") return json(res, 200, { item: row, message: "Marked as reviewed.", changed: true });
      if (act === "next-action") {
        row.nextActionAt = body.nextActionAt ?? null;
        return json(res, 200, { item: row, message: "Next action updated.", changed: true });
      }
      return json(res, 404, { status: 404, code: "NOT_FOUND" });
    }), true;
  };
}

/**
 * Dev mock for `/api/orgs/{orgId}/mkt/interviews/**` (Marketing workspace, Interviews page), in memory, DEV ONLY. The rows are the approved
 * "Interviews" board, dated into the CURRENT week (Sunday start) so the default date range shows them. Reads honour from/to/status/clientId/dir;
 * the writes mutate the in-memory rows the way the API does (E1: a reschedule is a proposal; nothing submits for a consultant).
 * Only acme (id 2) members who hold the marketing grants see it; anyone else gets the API's 404.
 */
const MEMBERS = new Set(["marketer@acme.com", "sarah@acme.com", "demo-ent-acme-omar", "demo-ent-acme-sarah"]);
const DAY = 86400e3;
const slug = (name) => name.toLowerCase().replace(/\s+/g, "-");
const avatar = (name) => `/ent/marketer/interviews/${slug(name)}.png`;

const startOfWeek = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d;
};
/** day offset from Sunday + local clock time */
const at = (dayOffset, h, m = 0) => {
  const d = startOfWeek();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const CLIENTS = ["TechCorp", "Global Bank", "CloudScale", "HealthPlus", "DataMatrix", "FinTech Solutions", "InnovateTech"];
const clientId = (name) => CLIENTS.indexOf(name) + 1;

const state = () => {
  const row = (id, consultant, role, client, type, startsAt, round, recruiter, status) => ({
    id, consultantId: id, consultant, avatarUrl: avatar(consultant), role, clientId: clientId(client), client, type, startsAt, durationMinutes: 45, round, recruiter, status, proposedFor: null, rescheduleCount: status === "RESCHEDULED" ? 1 : 0,
  });
  return {
    rows: [
      row(1, "Alex Morgan", "Java Developer", "TechCorp", "VIDEO", at(1, 10), "1st Round", "Priya Sharma", "CONFIRMED"),
      row(2, "Priya Sharma", "Business Analyst", "Global Bank", "ONSITE", at(1, 14), "Final Round", "Emily Lawson", "CONFIRMED"),
      row(3, "Michael Park", "AWS Engineer", "CloudScale", "TECHNICAL", at(2, 11), "2nd Round", "David Kim", "SCHEDULED"),
      row(4, "Emily Lawson", "Project Manager", "HealthPlus", "PANEL", at(3, 13), "1st Round", "Priya Sharma", "PENDING_FEEDBACK"),
      row(5, "David Kim", "Data Analyst", "DataMatrix", "VIDEO", at(3, 15), "Final Round", "Michael Park", "SCHEDULED"),
      row(6, "Sophia Patel", "QA Engineer", "FinTech Solutions", "TECHNICAL", at(4, 10, 30), "1st Round", "Alex Morgan", "RESCHEDULED"),
      row(7, "Daniel Wright", "DevOps Engineer", "CloudScale", "PANEL", at(4, 14), "2nd Round", "Emily Lawson", "AWAITING_CONFIRMATION"),
      row(8, "Olivia Chen", "Product Manager", "InnovateTech", "CLIENT", at(5, 11), "Final Round", "David Kim", "SCHEDULED"),
    ],
    pending: [
      { id: 101, interviewAt: at(-1, 10), consultant: "James Wilson", avatarUrl: avatar("James Wilson"), client: "TechCorp", round: "1st", daysOverdue: 2 },
      { id: 102, interviewAt: at(0, 10), consultant: "Olivia Chen", avatarUrl: avatar("Olivia Chen"), client: "InnovateTech", round: "Final", daysOverdue: 2 },
      { id: 103, interviewAt: at(1, 9), consultant: "Emily Lawson", avatarUrl: avatar("Emily Lawson"), client: "HealthPlus", round: "1st", daysOverdue: 1 },
      { id: 104, interviewAt: at(1, 15), consultant: "Ryan Patel", avatarUrl: avatar("Ryan Patel"), client: "FinTech", round: "2nd", daysOverdue: 1 },
      { id: 105, interviewAt: at(2, 9), consultant: "Sophia Patel", avatarUrl: avatar("Sophia Patel"), client: "CloudScale", round: "1st", daysOverdue: 0 },
    ],
    prep: [
      ["Review consultant resume and past feedback", true],
      ["Share interview details with consultant", true],
      ["Send calendar invite and meeting link", false],
      ["Share client briefing and interview agenda", false],
      ["Confirm technical requirements (if applicable)", false],
      ["Prepare role-specific questions", false],
      ["Notify internal stakeholders", false],
    ].map(([label, done], i) => ({ id: i + 1, label, done })),
  };
};

const kpi = (key, value, deltaPct, sparkline) => ({ key, value, deltaPct, sparkline });

export function createMktInterviewsMock({ json, subOf = () => null }) {
  let s = state();
  const overview = (url) => {
    const q = url.searchParams;
    const wk = startOfWeek();
    const from = q.get("from") || ymd(wk);
    const to = q.get("to") || ymd(new Date(wk.getTime() + 6 * DAY));
    const lo = new Date(`${from}T00:00:00`).getTime();
    const hi = new Date(`${to}T00:00:00`).getTime() + DAY;
    const status = q.get("status");
    const client = q.get("clientId");
    const dir = q.get("dir") === "desc" ? -1 : 1;
    const matches = s.rows
      .filter((r) => new Date(r.startsAt).getTime() >= lo && new Date(r.startsAt).getTime() < hi)
      .filter((r) => !status || r.status === status)
      .filter((r) => !client || String(r.clientId) === client)
      .sort((a, b) => dir * (new Date(a.startsAt) - new Date(b.startsAt)));
    const size = Math.min(Number(q.get("size")) || 25, 100);
    const page = Number(q.get("page")) || 0;
    const upcoming = s.rows.filter((r) => r.status !== "COMPLETED").sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt)).slice(0, 5);
    return {
      generatedAt: new Date().toISOString(),
      kpis: [
        kpi("interviewsThisWeek", 12, 20, [6, 7, 8, 7, 9, 8, 10, 12]),
        kpi("confirmedInterviews", 8, 33, [3, 4, 4, 5, 5, 6, 6, 8]),
        kpi("pendingFeedback", s.pending.length, -17, [8, 7, 7, 6, 7, 6, 6, s.pending.length]),
        kpi("reschedules", 2, -50, [3, 4, 2, 3, 4, 3, 4, 2]),
      ],
      schedule: { items: matches.slice(page * size, page * size + size), total: matches.length, page, size, from, to },
      upcoming,
      pendingFeedback: s.pending,
      checklist: { interviewId: upcoming[0]?.id ?? 0, consultant: upcoming[0]?.consultant ?? "", client: upcoming[0]?.client ?? "", items: s.prep },
      reminders: upcoming.map((r) => ({ id: r.id, startsAt: r.startsAt, consultant: r.consultant, client: r.client, type: r.type })),
      clients: CLIENTS.map((name, i) => ({ id: i + 1, name })),
    };
  };
  const readJson = (req) =>
    new Promise((resolve) => {
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

  return function handle(req, res, path, method) {
    const m = /^\/api\/orgs\/(\d+)\/mkt\/interviews(?:\/(\d+)(?:\/(prep|reschedule|confirm|feedback|remind)(?:\/(\d+))?)?)?$/.exec(path);
    if (!m) return false;
    const login = subOf(req);
    if (Number(m[1]) !== 2 || !login || !MEMBERS.has(login)) return req.resume(), json(res, 404, { status: 404, code: "NOT_FOUND" }), true;
    const [, , idText, action, itemText] = m;
    const id = Number(idText);
    if (!idText) {
      req.resume();
      if (method !== "GET") return json(res, 405, { status: 405 }), true;
      return json(res, 200, overview(new URL(req.url, "http://mock"))), true;
    }
    const row = s.rows.find((r) => r.id === id);
    if (action === "prep" && method === "GET") return req.resume(), json(res, 200, { interviewId: id, consultant: row?.consultant ?? "", client: row?.client ?? "", items: s.prep }), true;
    readJson(req).then((body) => {
      if (action === "prep" && method === "PATCH") {
        const item = s.prep.find((i) => i.id === Number(itemText));
        if (!item) return json(res, 404, { status: 404, code: "NOT_FOUND" });
        item.done = body.done === true;
        return json(res, 200, { interviewId: id, consultant: row?.consultant ?? "", client: row?.client ?? "", items: s.prep });
      }
      if (method !== "POST" || !row) {
        // a "pending feedback" card row has no schedule row: feedback is still recordable
        const pend = s.pending.find((p) => p.id === id);
        if (action === "feedback" && method === "POST" && pend) {
          s.pending = s.pending.filter((p) => p.id !== id);
          return json(res, 200, { ...state().rows[0], id, consultant: pend.consultant, status: "COMPLETED" });
        }
        return json(res, 404, { status: 404, code: "NOT_FOUND" });
      }
      if (action === "reschedule") {
        if (!body.proposedAt || new Date(body.proposedAt) <= new Date()) return json(res, 422, { status: 422, code: "ORG_INVALID", message: "proposedAt: must be in the future" });
        Object.assign(row, { status: "RESCHEDULED", proposedFor: body.proposedAt, rescheduleCount: row.rescheduleCount + 1 });
      } else if (action === "confirm") {
        Object.assign(row, { status: "CONFIRMED", startsAt: row.proposedFor || row.startsAt, proposedFor: null });
      } else if (action === "feedback") {
        if (row.status !== "PENDING_FEEDBACK") return json(res, 409, { status: 409, code: "INTERVIEW_NOT_DONE", message: "The interview has not happened yet" });
        row.status = "COMPLETED";
      } else if (action !== "remind") return json(res, 404, { status: 404, code: "NOT_FOUND" });
      return json(res, 200, row);
    });
    return true;
  };
}

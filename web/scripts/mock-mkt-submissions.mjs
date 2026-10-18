/**
 * The Marketing Submissions API mock (marketer workspace), in memory, DEV ONLY: `/api/orgs/{orgId}/mkt/submissions[/...]`.
 * The first ten rows are the approved "Submissions" board, so the page can be compared to it side by side; the rest are generated so the
 * footer reads "Showing 1-10 of 86". KPI numbers and the donut are the board's literal numbers (the real API computes them from rows).
 * Writes work on the in-memory rows (create a draft, request approval, record approval / status, withdraw, saved views) and, like the API,
 * never "submit" anything. Only acme (id 2) members who hold the marketing grants see it; anyone else gets the API's 404.
 */
const MEMBERS = new Set(["marketer@acme.com", "sarah@acme.com", "demo-ent-acme-omar", "demo-ent-acme-sarah"]);
const H = 3600e3;
const D = 24 * H;
const ago = (ms) => new Date(Date.now() - ms).toISOString();

const PEOPLE = [
  [1, "Alex Morgan", "Java Developer"], [2, "Priya Sharma", "Business Analyst"], [3, "Michael Park", "AWS Engineer"], [4, "Emily Lawson", "Project Manager"],
  [5, "David Kim", "Data Analyst"], [6, "Sophia Patel", "QA Automation Engineer"], [7, "Daniel Brooks", "DevOps Engineer"], [8, "Olivia Martinez", "UI/UX Designer"],
  [9, "James Wilson", "IT Support Specialist"], [10, "Chloe Nguyen", "Business Analyst"],
];
const CLIENTS = [[1, "TechCorp"], [2, "Global Bank"], [3, "CloudScale"], [4, "HealthPlus"], [5, "DataWorks"], [6, "NextGen"], [7, "InnovateLab"], [8, "BrightPath"], [9, "Acme Inc"], [10, "Riverstone"]];
const JOBS = [
  [1001, "Senior Java Developer"], [1043, "Data Analyst"], [987, "Cloud Engineer"], [1022, "Project Manager"], [1105, "BI Developer"],
  [1098, "QA Automation Engineer"], [1077, "DevOps Engineer"], [1066, "UI/UX Designer"], [1051, "IT Support Specialist"], [1033, "Business Analyst"],
];
// The board's ten rows: [person, job, client, age(ms), approval, status, resume, updated-age(ms)]
const BOARD = [
  [0, 0, 0, 2 * H, "APPROVED", "SUBMITTED", "v3.2", 1 * D],
  [1, 1, 1, 4 * H, "AWAITING_APPROVAL", "DRAFT", "v2.1", 2 * D],
  [2, 2, 2, 1 * D, "APPROVED", "CLIENT_REVIEW", "v4.0", 1 * D],
  [3, 3, 3, 1 * D, "APPROVED", "INTERVIEW_REQUESTED", "v1.8", 3 * D],
  [4, 4, 4, 2 * D, "REJECTED", "REJECTED", "v2.0", 4 * D],
  [5, 5, 5, 2 * D, "AWAITING_APPROVAL", "DRAFT", "v1.5", 2 * D],
  [6, 6, 6, 3 * D, "APPROVED", "SUBMITTED", "v3.1", 5 * D],
  [7, 7, 7, 4 * D, "APPROVED", "CLIENT_REVIEW", "v2.3", 6 * D],
  [8, 8, 8, 4 * D, "AWAITING_APPROVAL", "SUBMITTED", "v1.4", 8 * D],
  [9, 9, 9, 5 * D, "APPROVED", "INTERVIEW_REQUESTED", "v2.7", 7 * D],
];
const MIX = [
  ["APPROVED", "SUBMITTED"], ["AWAITING_APPROVAL", "DRAFT"], ["APPROVED", "CLIENT_REVIEW"], ["DRAFT", "DRAFT"], ["APPROVED", "INTERVIEW_REQUESTED"], ["APPROVED", "SUBMITTED"], ["REJECTED", "REJECTED"],
];

const actionsOf = (approval, status) => {
  if (status === "DRAFT" && approval === "DRAFT") return ["REQUEST_APPROVAL", "WITHDRAW"];
  if (status === "DRAFT" && approval === "AWAITING_APPROVAL") return ["RECORD_APPROVAL", "WITHDRAW"];
  if (status === "REJECTED") return [];
  return ["RECORD_STATUS"];
};
const bucketOf = (r) => (r.approvalState === "AWAITING_APPROVAL" ? "AWAITING_APPROVAL" : r.status);
const NEXT = { DRAFT: ["SUBMITTED"], SUBMITTED: ["CLIENT_REVIEW", "INTERVIEW_REQUESTED", "REJECTED"], CLIENT_REVIEW: ["INTERVIEW_REQUESTED", "REJECTED"], INTERVIEW_REQUESTED: ["REJECTED"], REJECTED: [] };

function seedRows() {
  const rows = [];
  BOARD.forEach(([p, j, c, age, approval, status, resume, upd], i) => {
    rows.push({
      id: i + 1, code: `SUB-2026-${String(i + 1).padStart(3, "0")}`, p, j, c, submissionDate: ago(age), approvalState: approval, status,
      resume: { id: 100 + i, version: resume, updatedOn: ago(upd) }, events: [],
    });
  });
  for (let i = 10; i < 86; i++) {
    const [approval, status] = MIX[i % MIX.length];
    rows.push({
      id: i + 1, code: `SUB-2026-${String(i + 1).padStart(3, "0")}`, p: i % 10, j: (i * 3) % 10, c: (i * 7) % 10, submissionDate: ago((6 + (i - 10) * 0.3) * D),
      approvalState: approval, status, resume: { id: 100 + i, version: `v${1 + (i % 4)}.${i % 9}`, updatedOn: ago((7 + (i - 10) * 0.3) * D) }, events: [],
    });
  }
  rows.forEach((r) => r.events.push({ id: r.id * 10, kind: "CREATED", field: null, from: null, to: "DRAFT", detail: null, at: new Date(new Date(r.submissionDate).getTime() - 2 * D).toISOString() }));
  return rows;
}

const wire = (r) => ({
  id: r.id, code: r.code,
  consultant: { id: PEOPLE[r.p][0], name: PEOPLE[r.p][1], role: PEOPLE[r.p][2], avatarUrl: `/ent/marketer/submissions/${PEOPLE[r.p][1].toLowerCase().replace(/ /g, "-")}.png` },
  job: { id: r.j, title: JOBS[r.j][1], code: `JOB-${JOBS[r.j][0]}` },
  client: { id: CLIENTS[r.c][0], name: CLIENTS[r.c][1] },
  submissionDate: r.submissionDate, approvalState: r.approvalState, resume: r.resume, status: r.status, bucket: bucketOf(r), actions: actionsOf(r.approvalState, r.status),
});

const ACTIVITY = () => [
  { id: 1, submissionId: 1, kind: "SUBMITTED", text: "Alex Morgan submitted to TechCorp", detail: "Senior Java Developer", at: ago(2 * H) },
  { id: 2, submissionId: 2, kind: "SUBMITTED", text: "Priya Sharma submitted to Global Bank", detail: "Data Analyst", at: ago(4 * H) },
  { id: 3, submissionId: 3, kind: "CLIENT_REVIEW", text: "Michael Park moved to Client Review", detail: "Cloud Engineer at CloudScale", at: ago(1 * D) },
  { id: 4, submissionId: 4, kind: "INTERVIEW", text: "Emily Lawson interview requested", detail: "Project Manager at HealthPlus", at: ago(1 * D) },
  { id: 5, submissionId: 5, kind: "REJECTED", text: "David Kim's submission was rejected", detail: "BI Developer at DataWorks", at: ago(2 * D) },
];

const BREAKDOWN = (period) => {
  const c = { DRAFT: 14, AWAITING_APPROVAL: 18, SUBMITTED: 22, CLIENT_REVIEW: 24, INTERVIEW_REQUESTED: 6, REJECTED: 6 };
  const labels = { DRAFT: "Draft", AWAITING_APPROVAL: "Awaiting Approval", SUBMITTED: "Submitted", CLIENT_REVIEW: "Client Review", INTERVIEW_REQUESTED: "Interview Requested", REJECTED: "Rejected" };
  const pct = { DRAFT: 16, AWAITING_APPROVAL: 21, SUBMITTED: 26, CLIENT_REVIEW: 28, INTERVIEW_REQUESTED: 7, REJECTED: 7 };
  return { period, total: 86, buckets: Object.keys(c).map((key) => ({ key, label: labels[key], count: c[key], pct: pct[key] })) };
};

const KPIS = {
  pendingApprovals: { value: 12, deltaPct: 20, sparkline: [6, 7, 7, 9, 8, 11, 10, 12] },
  submittedToday: { value: 18, deltaPct: 28, sparkline: [9, 12, 10, 14, 13, 16, 15, 18] },
  underClientReview: { value: 24, deltaPct: 14, sparkline: [15, 17, 16, 19, 18, 21, 20, 24] },
  rejected: { value: 6, deltaPct: -25, sparkline: [9, 8, 9, 7, 8, 7, 8, 6] },
};

const readBody = (req) =>
  new Promise((resolve) => {
    let s = "";
    req.on("data", (d) => (s += d));
    req.on("end", () => {
      try {
        resolve(s ? JSON.parse(s) : {});
      } catch {
        resolve(null);
      }
    });
  });

export function createMktSubmissionsMock({ json, subOf = () => null }) {
  const rows = seedRows();
  let nextId = 1000;
  const views = [];
  const err = (res, status, error, code) => (json(res, status, { status, error, detail: error, code }), true);

  return function handle(req, res, path, method) {
    const m = /^\/api\/orgs\/(\d+)\/mkt\/submissions(?:\/(options|views|\d+)(?:\/(request-approval|approval|status|\d+))?)?$/.exec(path);
    if (!m) return false;
    const login = subOf(req);
    if (Number(m[1]) !== 2 || !login || !MEMBERS.has(login)) {
      req.resume();
      return json(res, 404, { status: 404, code: "NOT_FOUND" }), true;
    }
    const [, , seg, sub] = m;
    const url = new URL(req.url, "http://mock");

    if (!seg && method === "GET") {
      req.resume();
      const q = url.searchParams;
      const text = (q.get("q") || "").toLowerCase();
      const status = q.get("status");
      const approval = q.get("approval");
      const client = q.get("clientId");
      const title = (q.get("jobTitle") || "").toLowerCase();
      const days = { "7d": 7, "30d": 30, "90d": 90 }[q.get("period") || "30d"];
      let list = rows.map(wire).filter((r) => {
        if (days && Date.now() - new Date(r.submissionDate).getTime() > days * D) return false;
        if (status && r.bucket !== status) return false;
        if (approval && r.approvalState !== approval) return false;
        if (client && String(r.client.id) !== client) return false;
        if (title && r.job.title.toLowerCase() !== title) return false;
        return !text || [r.consultant.name, r.job.title, r.client.name, r.code, r.job.code].some((s) => s.toLowerCase().includes(text));
      });
      const key = q.get("sort") || "date";
      const dir = (q.get("dir") || (key === "date" ? "desc" : "asc")) === "desc" ? -1 : 1;
      const val = { consultant: (r) => r.consultant.name, jobTitle: (r) => r.job.title, client: (r) => r.client.name, approval: (r) => r.approvalState, resume: (r) => r.resume?.version || "", status: (r) => r.status, date: (r) => r.submissionDate }[key] || ((r) => r.submissionDate);
      list = list.sort((a, b) => (val(a) < val(b) ? -dir : val(a) > val(b) ? dir : 0));
      const size = Math.min(100, Math.max(1, Number(q.get("size")) || 10));
      const page = Math.max(0, Number(q.get("page")) || 0);
      return json(res, 200, {
        kpis: KPIS, items: list.slice(page * size, page * size + size), total: list.length, page, size, breakdown: BREAKDOWN(q.get("donutPeriod") || "30d"), activity: ACTIVITY(),
        filters: { clients: CLIENTS.map(([id, name]) => ({ id, name })), jobTitles: [...new Set(JOBS.map((j) => j[1]))].sort() }, views,
      }), true;
    }
    if (seg === "options" && method === "GET") {
      req.resume();
      return json(res, 200, {
        consultants: PEOPLE.map(([id, name, role]) => ({ id, name, role, avatarUrl: null })),
        jobs: JOBS.map(([code, title], i) => ({ id: i, title, code: `JOB-${code}`, client: CLIENTS[i][1] })),
      }), true;
    }

    if (seg === "views" && method === "POST" && !sub) {
      return readBody(req).then((b) => {
        if (!b || !String(b.name || "").trim()) return err(res, 422, "give the view a name of 1 to 60 characters", "ORG_INVALID");
        const v = { id: nextId++, name: String(b.name).trim(), q: b.q ?? null, status: b.status ?? null, approval: b.approval ?? null, clientId: b.clientId ?? null, jobTitle: b.jobTitle ?? null, period: b.period ?? null };
        const at = views.findIndex((x) => x.name === v.name);
        if (at >= 0) views[at] = { ...v, id: views[at].id };
        else views.push(v);
        return json(res, 201, views.find((x) => x.name === v.name)), true;
      }), true;
    }
    if (seg === "views" && method === "DELETE" && sub) {
      req.resume();
      const at = views.findIndex((v) => String(v.id) === sub);
      if (at < 0) return err(res, 404, "Not found.", "NOT_FOUND");
      views.splice(at, 1);
      res.statusCode = 204;
      return res.end(), true;
    }

    if (!seg && method === "POST") {
      return readBody(req).then((b) => {
        if (!b || b.consultantId == null || b.requirementId == null) return err(res, 422, "consultantId: a consultant and a job are required", "ORG_INVALID");
        const p = PEOPLE.findIndex((x) => x[0] === Number(b.consultantId));
        if (p < 0 || !JOBS[Number(b.requirementId)]) return err(res, 404, "Not found.", "NOT_FOUND");
        if (rows.some((r) => r.p === p && r.j === Number(b.requirementId))) return err(res, 409, "A submission for this consultant and job already exists.", "SUBMISSION_EXISTS");
        const r = { id: nextId++, code: `SUB-2026-${String(rows.length + 1).padStart(3, "0")}`, p, j: Number(b.requirementId), c: Number(b.requirementId), submissionDate: new Date().toISOString(), approvalState: "DRAFT", status: "DRAFT", resume: null, events: [] };
        r.events.push({ id: r.id * 10, kind: "CREATED", field: null, from: null, to: "DRAFT", detail: b.note || null, at: r.submissionDate });
        rows.unshift(r);
        return json(res, 201, wire(r)), true;
      }), true;
    }

    const row = seg && /^\d+$/.test(seg) ? rows.find((r) => String(r.id) === seg) : null;
    if (!row) {
      req.resume();
      return err(res, 404, "Not found.", "NOT_FOUND");
    }
    const log = (kind, field, from, to, detail) => row.events.push({ id: nextId++, kind, field, from, to, detail: detail || null, at: new Date().toISOString() });
    if (!sub && method === "GET") {
      req.resume();
      return json(res, 200, { row: wire(row), note: null, events: row.events }), true;
    }
    if (!sub && method === "DELETE") {
      req.resume();
      if (row.status !== "DRAFT" || !["DRAFT", "AWAITING_APPROVAL"].includes(row.approvalState)) return err(res, 409, "Only a draft can be withdrawn.", "SUBMISSION_STATE");
      rows.splice(rows.indexOf(row), 1);
      res.statusCode = 204;
      return res.end(), true;
    }
    if (sub === "request-approval" && method === "POST") {
      req.resume();
      if (row.approvalState !== "DRAFT" || row.status !== "DRAFT") return err(res, 409, "Only a draft that has not been sent for approval can be sent.", "SUBMISSION_STATE");
      log("APPROVAL_REQUESTED", "APPROVAL", "DRAFT", "AWAITING_APPROVAL");
      row.approvalState = "AWAITING_APPROVAL";
      return json(res, 200, wire(row)), true;
    }
    if (sub === "approval" && method === "POST") {
      return readBody(req).then((b) => {
        const d = String(b?.decision || "").toUpperCase();
        if (d !== "APPROVED" && d !== "REJECTED") return err(res, 422, "decision: must be APPROVED or REJECTED", "ORG_INVALID");
        if (row.approvalState !== "AWAITING_APPROVAL") return err(res, 409, "This package is not waiting for an approval.", "SUBMISSION_STATE");
        log("APPROVAL_DECIDED", "APPROVAL", "AWAITING_APPROVAL", d, b?.note);
        row.approvalState = d;
        if (d === "REJECTED") row.status = "REJECTED";
        return json(res, 200, wire(row)), true;
      }), true;
    }
    if (sub === "status" && method === "PATCH") {
      return readBody(req).then((b) => {
        const s = String(b?.status || "").toUpperCase();
        if (!(NEXT[row.status] || []).includes(s)) return err(res, 409, `That status cannot be recorded from ${row.status}.`, "SUBMISSION_STATE");
        if (row.status === "DRAFT" && row.approvalState !== "APPROVED") return err(res, 409, "A package can be recorded as submitted only after it is approved.", "SUBMISSION_NOT_APPROVED");
        log("STATUS_RECORDED", "STATUS", row.status, s, b?.note);
        row.status = s;
        if (s === "SUBMITTED") row.submissionDate = new Date().toISOString();
        return json(res, 200, wire(row)), true;
      }), true;
    }
    req.resume();
    return json(res, 405, { status: 405 }), true;
  };
}

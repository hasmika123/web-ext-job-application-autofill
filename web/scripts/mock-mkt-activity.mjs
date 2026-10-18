/**
 * Dev mock for `/api/orgs/{orgId}/mkt/activity/**` (Marketing workspace), in memory, DEV ONLY. The rows are the approved "Activities" board: the ten most recent
 * rows exactly as drawn (Oct 18 .. Oct 14, 2024) followed by generated filler so the board's numbers are real counts of rows (148 activities: 28 resume, 36
 * submission, 42 follow-up, 18 interview, 14 application, 6 offer, 4 placement). The mock does NOT filter by date (it always answers the October 2024 range the board
 * shows); every other filter, the sort and the paging work. Logging only appends a manual row (E1: nothing is submitted or sent). Only acme (id 2) members who hold
 * the marketing grants see it.
 */
const MEMBERS = new Set(["marketer@acme.com", "sarah@acme.com", "demo-ent-acme-omar", "demo-ent-acme-sarah"]);
const HOUR = 3600e3;
const DAY = 24 * HOUR;
const photo = (name) => `/ent/marketer/activity/${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png`;

const PEOPLE = ["Emily Lawson", "Sarah Chen", "Michael Park", "Priya Sharma", "Alex Morgan", "Daniel Wright", "Olivia Bennett", "Ethan Brooks", "Noah Patel", "David Kim", "Anna Wilson", "Daniel Kim", "Isabella Rossi"];
const CLIENTS = ["TechCorp", "Global Bank", "CloudScale", "HealthPlus", "AWS", "RetailCo", "NextGen Tech", "ACME Internal"];
const GROUP_LABEL = { RESUME: "Resume", OPPORTUNITY: "Opportunity", SUBMISSION: "Submission", FOLLOWUP: "Follow-up", INTERVIEW: "Interview", FEEDBACK: "Feedback", APPLICATION: "Application", OFFER: "Offer", PLACEMENT: "Placement" };
const SUMMARY = [
  ["RESUME", "Resume Updates"], ["SUBMISSION", "Submissions"], ["FOLLOWUP", "Client Follow-ups"], ["INTERVIEW", "Interviews"], ["APPLICATION", "Applications"], ["OFFER", "Offers"], ["PLACEMENT", "Placements"],
];
const SUMMARY_OF = { FEEDBACK: "INTERVIEW" };
const MANUAL_TYPES = [
  ["RESUME_UPDATED", "Resume Updated"], ["OPPORTUNITY_ASSIGNED", "Opportunity Assigned"], ["SUBMISSION_PREPARED", "Submission Prepared"], ["FOLLOWUP_LOGGED", "Recruiter Follow-up Logged"],
  ["INTERVIEW_SCHEDULED", "Interview Scheduled"], ["FEEDBACK_RECEIVED", "Interview Feedback Received"], ["APPLICATION_MOVED", "Application Moved"], ["OFFER_RECEIVED", "Offer Received"],
];
const GROUP_OF_TYPE = {
  RESUME_UPDATED: "RESUME", OPPORTUNITY_ASSIGNED: "OPPORTUNITY", SUBMISSION_PREPARED: "SUBMISSION", FOLLOWUP_LOGGED: "FOLLOWUP", INTERVIEW_SCHEDULED: "INTERVIEW", FEEDBACK_RECEIVED: "FEEDBACK",
  APPLICATION_MOVED: "APPLICATION", OFFER_RECEIVED: "OFFER",
};

let nextId = 1;
const row = (type, group, title, subtitle, at, actor, consultant, client, tag, extra = {}) => ({
  id: `MOCK:${nextId++}`, source: "MOCK", type, group, groupLabel: GROUP_LABEL[group], title, subtitle, at, actor: { id: 10 + PEOPLE.indexOf(actor), name: actor, avatarUrl: photo(actor) },
  consultant: { id: 100 + PEOPLE.indexOf(consultant), name: consultant, avatarUrl: photo(consultant) }, client: { id: 200 + CLIENTS.indexOf(client), name: client }, tag, status: "COMPLETED", manual: false, ...extra,
});
const at = (day, h, m) => new Date(Date.UTC(2024, 9, day, h, m)).toISOString();

// the board's ten rows; the Opportunity row is drawn under Applications in the summary (the board has no Opportunities line), so its group here is APPLICATION
const rows = [
  row("RESUME_UPDATED", "RESUME", "Resume Updated", "Updated work experience and skills", at(18, 16, 32), "Emily Lawson", "Alex Morgan", "TechCorp", "Profile"),
  row("OPPORTUNITY_ASSIGNED", "APPLICATION", "Opportunity Assigned", "Assigned to new opportunity", at(18, 14, 15), "Sarah Chen", "Priya Sharma", "Global Bank", "Marketing", { groupLabel: "Opportunity" }),
  row("SUBMISSION_APPROVED", "SUBMISSION", "Consultant Approved Submission", "Approved to submit to client", at(18, 11, 40), "Michael Park", "David Kim", "CloudScale", "Approval"),
  row("CANDIDATE_SUBMITTED", "SUBMISSION", "Candidate Submitted to Client", "Submitted profile for consideration", at(17, 15, 26), "Priya Sharma", "Emily Lawson", "HealthPlus", "Client"),
  row("FOLLOWUP_LOGGED", "FOLLOWUP", "Recruiter Follow-up Logged", "Spoke with hiring manager", at(17, 13, 10), "Alex Morgan", "Michael Park", "AWS", "Client Call"),
  row("INTERVIEW_SCHEDULED", "INTERVIEW", "Interview Scheduled", "Technical interview scheduled", at(16, 11, 0), "Daniel Wright", "Anna Wilson", "RetailCo", "Technical"),
  row("FEEDBACK_RECEIVED", "FEEDBACK", "Interview Feedback Received", "Positive feedback from client", at(15, 16, 20), "Olivia Bennett", "Daniel Kim", "NextGen Tech", "Positive"),
  row("APPLICATION_MOVED", "APPLICATION", "Application Moved to Interview", "Moved to interview stage", at(15, 10, 15), "Ethan Brooks", "Isabella Rossi", "ACME Internal", "Pipeline"),
  row("OFFER_RECEIVED", "OFFER", "Offer Received", "Received written offer from client", at(14, 15, 5), "Noah Patel", "Alex Morgan", "TechCorp", "Success"),
  row("PLACEMENT_CONFIRMED", "PLACEMENT", "Placement Confirmed", "Consultant started - position filled", at(14, 9, 30), "Sarah Chen", "Priya Sharma", "Global Bank", "Closed"),
];
const FILL = [
  ["RESUME", 27, [["RESUME_UPDATED", "Resume Updated", "Refreshed the summary", "Profile"], ["RESUME_APPROVED", "Resume Approved", "Resume approved", "Approval"]]],
  ["SUBMISSION", 34, [["SUBMISSION_PREPARED", "Submission Prepared", "Draft submission prepared", "Draft"], ["CANDIDATE_SUBMITTED", "Candidate Submitted to Client", "Submitted profile for consideration", "Client"]]],
  ["FOLLOWUP", 41, [["FOLLOWUP_LOGGED", "Recruiter Follow-up Logged", "Call logged", "Client Call"], ["FOLLOWUP_REMINDER", "Follow-up Reminder Recorded", "Reminder request recorded", "Reminder"]]],
  ["INTERVIEW", 16, [["INTERVIEW_SCHEDULED", "Interview Scheduled", "Interview slot confirmed", "Scheduling"], ["FEEDBACK_RECEIVED", "Interview Feedback Received", "Feedback recorded", "Debrief"]]],
  ["APPLICATION", 12, [["APPLICATION_MOVED", "Application Moved to Review", "Moved to review stage", "Pipeline"]]],
  ["OFFER", 5, [["OFFER_RECEIVED", "Offer Received", "Received written offer from client", "Success"]]],
  ["PLACEMENT", 3, [["PLACEMENT_CONFIRMED", "Placement Confirmed", "Consultant started - position filled", "Closed"]]],
];
let k = 0;
for (const [group, n, kinds] of FILL) {
  for (let i = 0; i < n; i++, k++) {
    const [type, title, sub, tag] = kinds[i % kinds.length];
    const g = type === "FEEDBACK_RECEIVED" ? "FEEDBACK" : group;
    rows.push(row(type, g, title, sub, at(1 + (k % 13), 9 + (k % 8), (k * 7) % 60), PEOPLE[k % PEOPLE.length], PEOPLE[(k * 5 + 3) % PEOPLE.length], CLIENTS[(k * 3) % CLIENTS.length], tag));
  }
}

const sumGroup = (g) => SUMMARY_OF[g] ?? g;
const count = (list, g) => list.filter((r) => sumGroup(r.group) === g).length;

function upcoming() {
  const now = new Date();
  const day = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const t = (d, h) => new Date(day + d * DAY + h * HOUR).toISOString();
  return [
    { id: "FOLLOWUP:1", kind: "FOLLOWUP", icon: "phone", title: "Client follow-up: TechCorp", consultantName: "Alex Morgan", at: t(0, 10) },
    { id: "FOLLOWUP:2", kind: "FOLLOWUP", icon: "message", title: "Interview feedback call", consultantName: "Emily Lawson", at: t(0, 14) },
    { id: "FOLLOWUP:3", kind: "FOLLOWUP", icon: "resume", title: "Send updated resume", consultantName: "Priya Sharma", at: t(1, 9) },
    { id: "FOLLOWUP:4", kind: "FOLLOWUP", icon: "application", title: "Check application status", consultantName: "Michael Park", at: t(1, 13) },
    { id: "FOLLOWUP:5", kind: "FOLLOWUP", icon: "offer", title: "Follow up on offer details", consultantName: "Daniel Kim", at: t(3, 10) },
  ];
}

const norm = (s) => String(s ?? "").toLowerCase();

function view(params) {
  const f = (name) => params.get(name) || "";
  const typeFilter = f("type").toUpperCase().replace(/[-_ ]/g, "");
  const q = norm(f("q"));
  const common = rows.filter(
    (r) =>
      (!f("consultantId") || String(r.consultant.id) === f("consultantId")) && (!f("clientId") || String(r.client.id) === f("clientId")) && (!f("ownerId") || String(r.actor.id) === f("ownerId")) &&
      (!f("status") || r.status === f("status").toUpperCase()) && (!q || [r.title, r.subtitle, r.tag, r.groupLabel, r.consultant.name, r.client.name, r.actor.name].some((x) => norm(x).includes(q))),
  );
  const shown = common.filter((r) => !typeFilter || r.group.replace(/_/g, "") === typeFilter);
  const sorted = [...shown].sort((a, b) => (f("sort") === "oldest" ? 1 : -1) * (Date.parse(a.at) - Date.parse(b.at)));
  const size = Math.min(Number(f("size")) || 10, 100);
  const page = Math.max(0, Number(f("page")) || 0);
  const tile = (key, g, delta, spark) => ({ key, value: g ? count(common, g) : common.length, deltaPct: delta, sparkline: spark });
  const sumRows = SUMMARY.map(([g, label]) => ({ key: g, label, count: count(rows, g), pct: Math.round((count(rows, g) * 1000) / rows.length) / 10 }));
  const ups = upcoming();
  return {
    generatedAt: new Date().toISOString(), from: f("from") || "2024-10-01", to: f("to") || "2024-10-31", canLog: true,
    kpis: [
      tile("total", null, 22, [14, 18, 16, 21, 19, 23, 22, 26]), tile("resume", "RESUME", 33, [3, 4, 3, 5, 4, 5, 6, 8]), tile("submission", "SUBMISSION", 20, [5, 6, 5, 7, 6, 8, 7, 9]),
      tile("followup", "FOLLOWUP", 14, [6, 7, 8, 7, 9, 8, 10, 11]), tile("interview", "INTERVIEW", 38, [2, 3, 2, 3, 4, 3, 4, 5]),
    ],
    activities: { items: sorted.slice(page * size, page * size + size), total: sorted.length, page, size },
    summary: { range: f("summaryRange") || "THIS_MONTH", from: "2024-10-01", to: "2024-10-31", total: rows.length, rows: sumRows },
    upcoming: ups, upcomingTotal: ups.length,
    options: {
      consultants: PEOPLE.map((n) => ({ id: 100 + PEOPLE.indexOf(n), name: n })), clients: CLIENTS.map((n) => ({ id: 200 + CLIENTS.indexOf(n), name: n })), owners: PEOPLE.map((n) => ({ id: 10 + PEOPLE.indexOf(n), name: n })),
      types: Object.entries(GROUP_LABEL).map(([key, label]) => ({ key, label })), manualTypes: MANUAL_TYPES.map(([key, label]) => ({ key, label })),
      statuses: [{ key: "COMPLETED", label: "Completed" }, { key: "SCHEDULED", label: "Scheduled" }, { key: "CANCELLED", label: "Cancelled" }],
      summaryRanges: [{ key: "THIS_MONTH", label: "This Month" }, { key: "LAST_MONTH", label: "Last Month" }, { key: "LAST_7_DAYS", label: "Last 7 Days" }, { key: "LAST_30_DAYS", label: "Last 30 Days" }],
    },
  };
}

export function createMktActivitiesMock({ json, subOf = () => null }) {
  return function handle(req, res, path, method) {
    const m = /^\/api\/orgs\/(\d+)\/mkt\/activity(?:\/(\d+)\/status)?(?:\?.*)?$/.exec(path);
    if (!m) return false;
    const login = subOf(req);
    if (Number(m[1]) !== 2 || !login || !MEMBERS.has(login)) return req.resume(), json(res, 404, { status: 404, code: "NOT_FOUND" }), true;
    const url = new URL(req.url ?? path, "http://mock");
    if (method === "GET" && !m[2]) return req.resume(), json(res, 200, view(url.searchParams)), true;
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const data = body ? JSON.parse(body) : {};
      if (method === "POST" && !m[2]) {
        const type = MANUAL_TYPES.find(([key]) => key === data.type);
        if (!type) return json(res, 422, { error: "type: is not one that can be logged" });
        const consultant = PEOPLE[(Number(data.consultantId) - 100 + PEOPLE.length) % PEOPLE.length] ?? PEOPLE[0];
        const client = CLIENTS[(Number(data.clientAccountId) - 200 + CLIENTS.length) % CLIENTS.length] ?? CLIENTS[0];
        const created = row(type[0], GROUP_OF_TYPE[type[0]], String(data.title ?? type[1]), String(data.detail ?? "") || type[1], data.occurredAt ?? new Date().toISOString(), "Sarah Chen", consultant, client, String(data.tags ?? "").split(",")[0] || "Manual", {
          id: `MANUAL:${nextId}`, source: "MANUAL", manual: true, status: data.status ?? "COMPLETED",
        });
        rows.unshift(created);
        return json(res, 200, { item: created });
      }
      const item = rows.find((r) => r.id === `MANUAL:${m[2]}`);
      if (!item) return json(res, 404, { status: 404, code: "NOT_FOUND" });
      item.status = data.status;
      return json(res, 200, { item });
    });
    return true;
  };
}

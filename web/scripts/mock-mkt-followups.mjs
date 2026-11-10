/**
 * Dev mock for `/api/orgs/{orgId}/mkt/followups/**` (Marketing workspace), in memory, DEV ONLY. The rows are the approved "Follow-ups" board
 * (12 due today, 6 overdue, 14 upcoming, 18 completed today, 14 waiting), so the page can be compared to it side by side. Writes change the in-memory
 * rows only; "reminder" records an event and never sends anything (E1). Only acme (id 2) members who hold the marketing grants see it.
 */
const MEMBERS = new Set(["marketer@acme.com", "sarah@acme.com", "demo-ent-acme-omar", "demo-ent-acme-sarah"]);
const DAY = 24 * 3600e3;
const startOfDay = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};
/** The n-th of 12 slots between now and the end of today, so "due today" always lies ahead whatever the hour. */
const soon = (n) => new Date(Date.now() + ((startOfDay() + DAY - Date.now()) * (n + 1)) / 14).toISOString();
const at = (dayOffset, h, m = 0) => new Date(startOfDay() + dayOffset * DAY + (h * 60 + m) * 60e3).toISOString();

const CONSULTANTS = {
  "Alex Morgan": "Java Developer", "Priya Sharma": "Business Analyst", "Michael Park": "AWS Engineer", "Emily Lawson": "Project Manager", "David Kim": "Data Analyst",
  "Sophia Martinez": "QA Engineer", "Daniel Wright": "DevOps Engineer", "Olivia Bennett": "UX Designer", "James Carter": "Data Engineer", "Ava Wilson": "Product Manager",
  "Ethan Brooks": "Cloud Engineer", "Isabella Rossi": "Salesforce Consultant", "Liam O'Connor": "Full Stack Developer", "Mia Thompson": "Scrum Master", "Noah Patel": "Data Analyst",
  "Charlotte Lee": "Business Analyst", "Benjamin Hall": "Java Developer",
};
const photo = (name) => `/ent/marketer/followups/${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png`;

let nextId = 1;
const make = (title, consultant, counterpart, channel, due, priority, status, extra = {}) => ({
  id: nextId++, title, consultantName: consultant, consultantId: 100 + Object.keys(CONSULTANTS).indexOf(consultant), counterpart, channel, priority, status, dueAt: due,
  completedAt: null, detail: `${consultant} - ${CONSULTANTS[consultant] ?? ""}`, applicationId: null, clientAccountId: null, ...extra,
});

const items = [
  // due today (the board's six, then six more)
  make("Interview feedback call", "Alex Morgan", "TechCorp", "PHONE", soon(0), "HIGH", "PENDING"),
  make("Send candidate availability", "Priya Sharma", "Global Bank", "EMAIL", soon(1), "MEDIUM", "IN_PROGRESS"),
  make("Confirm next interview", "Michael Park", "AWS", "PHONE", soon(2), "HIGH", "PENDING"),
  make("Share updated resume", "Emily Lawson", "HealthPlus", "EMAIL", soon(3), "MEDIUM", "PENDING"),
  make("Client debrief meeting", "David Kim", "CloudScale", "TEAMS", soon(4), "HIGH", "SCHEDULED"),
  make("Check reference status", "Sophia Martinez", "Deloitte", "PHONE", soon(5), "LOW", "PENDING"),
  make("Send engagement letter", "Liam O'Connor", "TechCorp", "EMAIL", soon(6), "MEDIUM", "PENDING"),
  make("Confirm start date", "Mia Thompson", "Global Bank", "PHONE", soon(7), "HIGH", "IN_PROGRESS"),
  make("Check consultant interest", "Noah Patel", "Deloitte", "TEAMS", soon(8), "LOW", "PENDING"),
  make("Follow up on submitted profiles", "Charlotte Lee", "AWS", "EMAIL", soon(9), "MEDIUM", "PENDING"),
  make("Schedule final interview", "Benjamin Hall", "HealthPlus", "PHONE", soon(10), "HIGH", "SCHEDULED"),
  make("Share interview prep materials", "Alex Morgan", "CloudScale", "EMAIL", soon(11), "MEDIUM", "PENDING"),
  // overdue
  make("Interview feedback (1st round)", "Daniel Wright", "FinTech Solutions", "EMAIL", at(-3, 9), "HIGH", "PENDING"),
  make("Send offer update", "Olivia Bennett", "RetailCo", "PHONE", at(-3, 11), "HIGH", "PENDING"),
  make("Follow up on background check", "James Carter", "HealthPlus", "EMAIL", at(-2, 10), "MEDIUM", "IN_PROGRESS"),
  make("Client decision status", "Ava Wilson", "NextGen Tech", "TEAMS", at(-2, 14), "MEDIUM", "PENDING"),
  make("Confirm start date", "Ethan Brooks", "CloudScale", "PHONE", at(-1, 11, 30), "HIGH", "PENDING"),
  make("Follow up on submitted profiles", "Isabella Rossi", "ACME Internal", "EMAIL", at(-1, 15), "LOW", "IN_PROGRESS"),
  // upcoming
  make("Schedule final interview", "Liam O'Connor", "TechCorp", "PHONE", at(1, 10), "MEDIUM", "NOT_STARTED"),
  make("Send engagement letter", "Mia Thompson", "Global Bank", "EMAIL", at(1, 14), "HIGH", "NOT_STARTED"),
  make("Follow up after client meeting", "Noah Patel", "Deloitte", "TEAMS", at(2, 11), "MEDIUM", "NOT_STARTED"),
  make("Check consultant interest", "Charlotte Lee", "AWS", "PHONE", at(2, 15, 30), "LOW", "NOT_STARTED"),
  make("Share interview prep materials", "Benjamin Hall", "HealthPlus", "EMAIL", at(3, 10), "MEDIUM", "NOT_STARTED"),
  ...Array.from({ length: 9 }, (_, i) => make("Check reference status", Object.keys(CONSULTANTS)[i], ["TechCorp", "Global Bank", "AWS"][i % 3], ["PHONE", "EMAIL", "TEAMS"][i % 3], at(3 + Math.floor(i / 3), 9 + i), ["HIGH", "MEDIUM", "LOW"][i % 3], "NOT_STARTED")),
  // waiting on a reply
  ...Array.from({ length: 14 }, (_, i) => make("Client decision status", Object.keys(CONSULTANTS)[i], ["TechCorp", "Global Bank", "AWS", "Deloitte"][i % 4], ["PHONE", "EMAIL"][i % 2], at(2 + (i % 5), 12), "MEDIUM", "WAITING", { updatedAt: at(-(i % 6), 10) })),
  // completed today
  ...Array.from({ length: 18 }, (_, i) => make("Interview feedback call", Object.keys(CONSULTANTS)[i % 17], "TechCorp", "PHONE", at(-1, 12), "MEDIUM", "COMPLETED", { completedAt: at(0, 0, 5 + i) })),
];
const events = [{ at: new Date().toISOString(), kind: "CALL_LOGGED", followupId: 0 }];

const view = (windowName) => {
  const now = Date.now();
  const endToday = startOfDay() + DAY;
  const open = items.filter((f) => f.status !== "COMPLETED" && f.status !== "WAITING");
  const today = open.filter((f) => Date.parse(f.dueAt) >= now && Date.parse(f.dueAt) < endToday);
  const overdue = items.filter((f) => f.status !== "COMPLETED" && Date.parse(f.dueAt) < now);
  const upcoming = open.filter((f) => Date.parse(f.dueAt) >= endToday);
  const completed = items.filter((f) => f.status === "COMPLETED").length;
  const waiting = items.filter((f) => f.status === "WAITING").length;
  const out = (list) => ({ items: list.map((f) => ({ ...f, avatarUrl: photo(f.consultantName), overdue: f.status !== "COMPLETED" && Date.parse(f.dueAt) < now })), total: list.length, page: 0, size: 100 });
  const scale = windowName === "LAST_WEEK" ? 0.8 : windowName === "THIS_MONTH" ? 3.1 : 1;
  const doneW = Math.round((completed + 14) * scale);
  const waitW = Math.round(waiting * scale);
  return {
    generatedAt: new Date().toISOString(),
    kpis: [
      { key: "dueToday", value: today.length, deltaPct: 33, sparkline: [6, 8, 7, 9, 8, 10, 9, 12] },
      { key: "overdue", value: overdue.length, deltaPct: 40, sparkline: [3, 4, 3, 5, 4, 3, 5, 6] },
      { key: "completedToday", value: completed, deltaPct: 20, sparkline: [10, 12, 11, 14, 13, 15, 16, 18] },
      { key: "waiting", value: waiting, deltaPct: 27, sparkline: [8, 9, 9, 10, 11, 12, 13, 14] },
    ],
    today: out(today),
    overdue: out(overdue),
    upcoming: out(upcoming),
    insights: { window: windowName, responseRatePct: Math.round((doneW * 1000) / (doneW + waitW)) / 10, avgResponseHours: 43.2, completed: doneW, waiting: waitW },
  };
};

export function createMktFollowupsMock({ json, subOf = () => null }) {
  return function handle(req, res, path, method) {
    const m = /^\/api\/orgs\/(\d+)\/mkt\/followups(?:\/([a-z]+|\d+)(?:\/([a-z]+))?)?(?:\?.*)?$/.exec(path);
    if (!m) return false;
    const login = subOf(req);
    if (Number(m[1]) !== 2 || !login || !MEMBERS.has(login)) return req.resume(), json(res, 404, { status: 404, code: "NOT_FOUND" }), true;
    const sub = m[2];
    const url = new URL(req.url ?? path, "http://mock");
    if (method === "GET" && !sub) return req.resume(), json(res, 200, view(url.searchParams.get("window") ?? "THIS_WEEK")), true;
    const id = sub && /^\d+$/.test(sub) ? Number(sub) : null;
    const item = items.find((f) => f.id === id);
    if (id === null) return req.resume(), json(res, 404, { status: 404 }), true;
    if (!item) return req.resume(), json(res, 404, { status: 404, code: "NOT_FOUND" }), true;
    const action = m[3];
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const data = body ? JSON.parse(body) : {};
      if (action === "reminder") events.push({ at: new Date().toISOString(), kind: "REMINDER_SENT", followupId: id });
      else if (action === "call") {
        events.push({ at: new Date().toISOString(), kind: "CALL_LOGGED", followupId: id });
        if (data.awaitingReply) item.status = "WAITING";
      } else if (action === "complete" || (action === "status" && data.status === "COMPLETED")) {
        item.status = "COMPLETED";
        item.completedAt = new Date().toISOString();
      } else if (action === "status") {
        item.status = data.status;
        item.completedAt = null;
      }
      json(res, 200, { item: { ...item, overdue: false }, event: action === "reminder" ? "REMINDER_SENT" : action === "call" ? "CALL_LOGGED" : "STATUS_CHANGED", emailed: false });
    });
    return true;
  };
}

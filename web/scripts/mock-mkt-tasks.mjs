/**
 * Dev mock for `/api/orgs/{orgId}/mkt/tasks/**` (Marketing workspace), in memory, DEV ONLY. The rows follow the approved "Tasks" board (24 open tasks: 5 overdue,
 * 8 due this week, 11 later; 16 completed this week; 18 owned by the caller and 6 by a teammate, so the mock caller is "wide"), so the page can be compared to it
 * side by side. Writes change the in-memory rows only and never send anything (E1). Only acme (id 2) members who hold the marketing grants see it.
 */
const MEMBERS = new Set(["marketer@acme.com", "sarah@acme.com", "demo-ent-acme-omar", "demo-ent-acme-sarah"]);
const HOUR = 3600e3;
const DAY = 24 * HOUR;
const ME = { id: 7, name: "Sarah Chen" };
const MATE = { id: 8, name: "Michael Park" };
const photo = (name) => `/ent/marketer/tasks/${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png`;

/** [title, detail, category, priority, related: consultant name | {client} | {label}] in the board's order. */
const BOARD = [
  ["Share new openings with team", "Send 5 new openings from TechCorp", "JOB_OPPORTUNITY", "HIGH", { client: "TechCorp" }],
  ["Review and update resume", "Update skills and keywords", "RESUME", "HIGH", "Ava Patel"],
  ["Schedule client call", "Discuss Q4 hiring needs", "CLIENT", "MEDIUM", { label: "Global Bank" }],
  ["Assign job matches", "Send top 3 matches to consultant", "JOB_MATCH", "HIGH", "Ethan Chen"],
  ["Follow up on application status", "Check status with hiring manager", "APPLICATION", "MEDIUM", "Noah Williams"],
  ["Configure new job stream", "Set up AWS job alerts", "JOB_STREAM", "MEDIUM", { label: "AWS" }],
  ["Prepare consultant for interview", "Share tips and do mock session", "INTERVIEW", "HIGH", "Olivia Brown"],
  ["Update job description summary", "Create client-facing summary", "CONTENT", "LOW", { client: "RetailCo" }],
  ["Send weekly job market update", "Top trends and opportunities", "MARKETING", "MEDIUM", { label: "All Consultants" }],
  ["Follow up with inactive consultant", "Check availability and interest", "FOLLOW_UP", "HIGH", "Liam Johnson"],
];
const OPEN_STATUS = ["IN_PROGRESS", "PENDING", "NOT_STARTED", "PENDING", "IN_PROGRESS", "NOT_STARTED", "PENDING", "NOT_STARTED", "NOT_STARTED", "PENDING"];
const OVERDUE_H = [-72, -60, -48, -30, -12];
const WEEK_H = [4, 20, 30, 50, 70, 100, 120, 150];

let nextId = 1;
const make = (i, due, status, extra = {}) => {
  const [title, detail, category, priority, rel] = BOARD[i % BOARD.length];
  return {
    id: nextId++, title, detail, category, priority, status, dueAt: new Date(due).toISOString(), completedAt: null,
    consultantId: typeof rel === "string" ? 100 + (i % 10) : null, consultantName: typeof rel === "string" ? rel : null,
    clientAccountId: rel && rel.client ? 50 : null, clientName: rel && rel.client ? rel.client : null, relatedLabel: rel && rel.label ? rel.label : null,
    owner: i % 2 === 1 && i < 12 ? MATE : ME, createdAt: Date.now() - 9 * DAY, ...extra,
  };
};

const now0 = Date.now();
const items = [
  ...OVERDUE_H.map((h, k) => make(k, now0 + h * HOUR, OPEN_STATUS[k])),
  ...WEEK_H.map((h, k) => make(5 + k, now0 + h * HOUR, OPEN_STATUS[(k + 1) % 10])),
  ...Array.from({ length: 11 }, (_, k) => make(13 + k, now0 + (8 + k * 1.5) * DAY, "NOT_STARTED", { createdAt: now0 - 3 * DAY })),
  ...Array.from({ length: 16 }, (_, k) => make(k, now0 - (k % 5) * DAY - 5 * HOUR, "COMPLETED", { completedAt: new Date(now0 - (k % 6) * DAY - 2 * HOUR).toISOString() })),
];

const isOpen = (t) => t.status !== "COMPLETED";
const row = (t, now = Date.now()) => ({
  id: t.id, title: t.title, detail: t.detail, category: t.category, priority: t.priority, status: t.status, overdue: isOpen(t) && Date.parse(t.dueAt) < now, dueAt: t.dueAt, completedAt: t.completedAt,
  consultantId: t.consultantId, consultantName: t.consultantName, clientAccountId: t.clientAccountId, clientName: t.clientName, relatedLabel: t.relatedLabel,
  ownerMemberId: t.owner.id, ownerName: t.owner.name, avatarUrl: photo(t.owner.name), mine: t.owner.id === ME.id, canDelete: t.owner.id === ME.id && isOpen(t),
});

const PRI = ["HIGH", "MEDIUM", "LOW"];
const view = (sp) => {
  const now = Date.now();
  const week = now + 7 * DAY;
  const tabOf = {
    ALL: (t) => isOpen(t), MY: (t) => isOpen(t) && t.owner.id === ME.id, TEAM: (t) => isOpen(t) && t.owner.id !== ME.id,
    OVERDUE: (t) => isOpen(t) && Date.parse(t.dueAt) < now, DUE_WEEK: (t) => isOpen(t) && Date.parse(t.dueAt) >= now && Date.parse(t.dueAt) < week,
    COMPLETED: (t) => !isOpen(t) && Date.parse(t.completedAt) >= now - 7 * DAY,
  };
  const tab = tabOf[sp.get("tab") ?? "ALL"] ? (sp.get("tab") ?? "ALL") : "ALL";
  let list = items.filter(tabOf[tab]);
  const cat = sp.get("category"), pri = sp.get("priority"), st = sp.get("status"), owner = sp.get("owner"), due = sp.get("due"), q = (sp.get("q") ?? "").toLowerCase();
  if (cat) list = list.filter((t) => t.category === cat);
  if (pri) list = list.filter((t) => t.priority === pri);
  if (st) list = list.filter((t) => t.status === st);
  if (owner) list = list.filter((t) => String(t.owner.id) === (owner === "me" ? String(ME.id) : owner));
  if (due) list = list.filter((t) => new Date(t.dueAt).toISOString().slice(0, 10) === due || (() => { const d = new Date(t.dueAt); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` === due; })());
  if (q) list = list.filter((t) => `${t.title} ${t.detail}`.toLowerCase().includes(q));
  list.sort((a, b) => (tab === "COMPLETED" ? Date.parse(b.completedAt) - Date.parse(a.completedAt) : Date.parse(a.dueAt) - Date.parse(b.dueAt)));
  const size = Math.min(Number(sp.get("size") ?? 10) || 10, 100);
  const page = Math.max(Number(sp.get("page") ?? 0) || 0, 0);
  const open = items.filter(isOpen);
  const bars = (a) => a.map((n, i) => n + (i % 2));
  return {
    generatedAt: new Date().toISOString(),
    wide: true,
    kpis: [
      { key: "total", value: open.length, deltaPct: 12, sparkline: bars([14, 16, 18, 19, 21, 22, 23, open.length]) },
      { key: "overdue", value: open.filter(tabOf.OVERDUE).length, deltaPct: 25, sparkline: bars([2, 2, 3, 3, 4, 4, 4, 5]) },
      { key: "dueThisWeek", value: open.filter(tabOf.DUE_WEEK).length, deltaPct: 14, sparkline: bars([3, 4, 4, 5, 6, 6, 7, 8]) },
      { key: "completedThisWeek", value: items.filter(tabOf.COMPLETED).length, deltaPct: 33, sparkline: bars([8, 9, 10, 12, 13, 14, 15, 16]) },
    ],
    tabs: {
      all: open.length, my: open.filter(tabOf.MY).length, team: open.filter(tabOf.TEAM).length, overdue: open.filter(tabOf.OVERDUE).length,
      dueThisWeek: open.filter(tabOf.DUE_WEEK).length, completed: items.filter(tabOf.COMPLETED).length,
    },
    tasks: { items: list.slice(page * size, page * size + size).map((t) => row(t, now)), total: list.length, page, size },
    upcoming: open.filter((t) => Date.parse(t.dueAt) >= now).sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt)).slice(0, 4).map((t) => row(t, now)),
    options: {
      consultants: [...new Set(items.map((t) => t.consultantName).filter(Boolean))].map((name, i) => ({ id: 100 + i, name })),
      clients: [{ id: 50, name: "TechCorp" }, { id: 51, name: "RetailCo" }],
      owners: [ME, MATE],
    },
  };
};

const calendar = (month) => {
  const byDay = new Map();
  for (const t of items) {
    const d = new Date(t.dueAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (!key.startsWith(month)) continue;
    const cur = byDay.get(key) ?? { date: key, total: 0, open: 0, topPriority: "LOW" };
    cur.total += 1;
    if (isOpen(t)) cur.open += 1;
    if (PRI.indexOf(t.priority) < PRI.indexOf(cur.topPriority)) cur.topPriority = t.priority;
    byDay.set(key, cur);
  }
  return { month, days: [...byDay.values()].sort((a, b) => (a.date < b.date ? -1 : 1)) };
};

export function createMktTasksMock({ json, subOf = () => null }) {
  return function handle(req, res, path, method) {
    const m = /^\/api\/orgs\/(\d+)\/mkt\/tasks(?:\/([a-z]+|\d+)(?:\/([a-z]+))?)?(?:\?.*)?$/.exec(path);
    if (!m) return false;
    const login = subOf(req);
    if (Number(m[1]) !== 2 || !login || !MEMBERS.has(login)) return req.resume(), json(res, 404, { status: 404, code: "NOT_FOUND" }), true;
    const sub = m[2];
    const url = new URL(req.url ?? path, "http://mock");
    if (method === "GET" && !sub) return req.resume(), json(res, 200, view(url.searchParams)), true;
    if (method === "GET" && sub === "calendar") {
      const d = new Date();
      return req.resume(), json(res, 200, calendar(url.searchParams.get("month") ?? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`)), true;
    }
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const data = body ? JSON.parse(body) : {};
      if (method === "POST" && !sub) {
        const t = make(0, Date.parse(data.dueAt), data.status ?? "NOT_STARTED", {
          title: data.title, detail: data.detail ?? null, category: data.category ?? "FOLLOW_UP", priority: data.priority ?? "MEDIUM", consultantId: data.consultantId ?? null,
          consultantName: null, clientAccountId: data.clientAccountId ?? null, clientName: null, relatedLabel: null, owner: ME, createdAt: Date.now(),
        });
        items.push(t);
        return json(res, 200, { item: row(t), event: "CREATED", emailed: false });
      }
      const id = sub && /^\d+$/.test(sub) ? Number(sub) : null;
      const t = items.find((x) => x.id === id);
      if (id === null || !t) return json(res, 404, { status: 404, code: "NOT_FOUND" });
      const action = m[3];
      if (method === "GET" && action === "assignees") return json(res, 200, [t.owner.id === ME.id ? MATE : ME].map((o) => ({ id: o.id, name: o.name })));
      if (method === "DELETE") {
        if (t.owner.id !== ME.id || !isOpen(t)) return json(res, 422, { error: "Only your own open tasks can be deleted." });
        items.splice(items.indexOf(t), 1);
        return json(res, 200, { item: null, event: "DELETED", emailed: false });
      }
      if (action === "complete") Object.assign(t, { status: "COMPLETED", completedAt: new Date().toISOString() });
      else if (action === "reopen") Object.assign(t, { status: "PENDING", completedAt: null });
      else if (action === "reassign") t.owner = data.ownerMemberId === MATE.id ? MATE : ME;
      else if (method === "PATCH") {
        for (const k of ["title", "detail", "category", "priority", "dueAt"]) if (data[k] !== undefined) t[k] = data[k];
        if (data.status !== undefined) Object.assign(t, { status: data.status, completedAt: data.status === "COMPLETED" ? new Date().toISOString() : null });
      }
      return json(res, 200, { item: row(t), event: (action ?? "update").toUpperCase(), emailed: false });
    });
    return true;
  };
}

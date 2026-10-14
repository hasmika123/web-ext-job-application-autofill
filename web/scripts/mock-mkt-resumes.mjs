/**
 * Dev mock for `/api/orgs/{orgId}/mkt/resumes` (Marketing workspace, Resumes board), in memory, DEV ONLY. The first ten rows are the
 * approved board; 38 more make "Showing 1-10 of 48". Filters, sort, paging and the marketer writes behave like the API (a real change
 * is a new version and goes back to Pending Review; approving is NOT possible here, the admin does that). Only acme (id 2) members who
 * hold the marketing grants see it; anyone else gets the API's 404.
 */
const MEMBERS = new Set(["marketer@acme.com", "sarah@acme.com", "demo-ent-acme-omar", "demo-ent-acme-sarah"]);
const DAY = 864e5;
const H = 36e5;
const ago = (ms) => new Date(Date.now() - ms).toISOString();

const BOARD = [
  ["Alex Morgan", "Java Developer", "Alex Morgan - Consulting Resume", 3, true, 92, "APPROVED", 2, "Java", "AVAILABLE"],
  ["Priya Sharma", "Business Analyst", "Priya Sharma - BA Resume", 2, true, 88, "APPROVED", 4, "Business Analysis", "NOTICE"],
  ["Michael Park", "AWS Engineer", "Michael Park - AWS Resume", 4, false, 85, "PENDING", 7, "AWS", "AVAILABLE"],
  ["Emily Lawson", "Project Manager", "Emily Lawson - PM Resume", 1, true, 76, "APPROVED", 9, "Project Management", "NOTICE"],
  ["David Kim", "Data Analyst", "David Kim - Data Analyst Resume", 3, false, 82, "NEEDS_UPDATE", 14, "SQL", "AVAILABLE"],
  ["Sophia Patel", "DevOps Engineer", "Sophia Patel - DevOps Resume", 2, true, 90, "APPROVED", 15, "Kubernetes", "ON_PROJECT"],
  ["James Wilson", "Full Stack Developer", "James Wilson - Full Stack Resume", 1, false, 68, "NEEDS_UPDATE", 21, "React", "AVAILABLE"],
  ["Olivia Martinez", "UI/UX Designer", "Olivia Martinez - UX Resume", 2, true, 80, "PENDING", 22, "Figma", "AVAILABLE"],
  ["Daniel Lee", "Data Scientist", "Daniel Lee - Data Scientist Resume", 3, false, 87, "APPROVED", 28, "Python", "ON_PROJECT"],
  ["Natalie Brown", "QA Engineer", "Natalie Brown - QA Resume", 1, true, 79, "NEEDS_UPDATE", 29, "Selenium", "AVAILABLE"],
];
const FIRST = ["Aarav", "Maya", "Liam", "Noah", "Zoe", "Ethan", "Ava", "Lucas", "Mia", "Henry", "Chloe", "Isaac", "Ruby", "Owen", "Nora", "Caleb", "Layla", "Felix", "Ivy", "Jonah", "Hana", "Theo", "Elena", "Mateo", "Sara", "Omar", "Leah", "Dev", "Tara", "Cole", "Anya", "Reid", "Pia", "Joel", "Rita", "Sean", "Lena", "Hugo"];
const LAST = ["Nguyen", "Garcia", "Ali", "Singh", "Cohen", "Reyes", "Novak", "Khan", "Silva", "Berg"];
const ROLES = ["Java Developer", "Business Analyst", "AWS Engineer", "Data Analyst", "QA Engineer", "DevOps Engineer", "Scrum Master", "UI/UX Designer"];
const EXPERIENCE = [
  { title: "Senior Consultant", employer: "Northwind Logistics", startYear: 2021, endYear: null },
  { title: "Software Engineer", employer: "TechCorp", startYear: 2018, endYear: 2021 },
  { title: "Associate Engineer", employer: "InnovateLab", startYear: 2015, endYear: 2018 },
];

function seed() {
  const rows = BOARD.map((b, i) => ({
    id: i + 1,
    consultantId: i + 1,
    consultantName: b[0],
    consultantTitle: b[1],
    avatarUrl: `/ent/marketer/resumes/${b[0].toLowerCase().replace(/ /g, "-")}.png`,
    title: b[2],
    targetRole: b[1],
    version: b[3],
    lastModifiedAt: ago(b[7] * DAY),
    primary: b[4],
    completeness: b[5],
    approval: b[6],
    hasFile: false,
    canEdit: true,
    skill: b[8],
    availability: b[9],
  }));
  // 38 more: 31 approved, 5 need an update, 2 pending, so the board totals are 48 / 36 / 8 / 4.
  const states = [...Array(31).fill("APPROVED"), ...Array(5).fill("NEEDS_UPDATE"), "PENDING", "PENDING"];
  for (let i = 0; i < 38; i++) {
    const name = `${FIRST[i]} ${LAST[i % LAST.length]}`;
    const role = ROLES[i % ROLES.length];
    rows.push({
      id: 11 + i,
      consultantId: 11 + i,
      consultantName: name,
      consultantTitle: role,
      avatarUrl: null,
      title: `${name} - ${role.split(" ")[0]} Resume`,
      targetRole: role,
      version: (i % 4) + 1,
      lastModifiedAt: ago((30 + i * 2) * DAY),
      primary: i % 3 !== 0,
      completeness: 60 + ((i * 7) % 38),
      approval: states[(i * 5) % states.length],
      hasFile: false,
      canEdit: true,
      skill: role.split(" ")[0],
      availability: i % 4 === 0 ? "ON_PROJECT" : "AVAILABLE",
    });
  }
  return rows;
}

const state = { rows: seed(), events: [], nextEvent: 100 };
const reset = () => {
  state.rows = seed();
  state.events = [];
};

const publicRow = (r) => {
  const row = { ...r };
  delete row.skill;
  delete row.availability;
  return row;
};
const SPARK = { total: [30, 33, 36, 39, 41, 44, 46, 48], profilesReady: [22, 24, 27, 29, 31, 33, 35, 36], needUpdates: [11, 11, 10, 10, 9, 9, 8, 8], approvalsPending: [2, 2, 3, 3, 3, 4, 4, 4] };
const DELTA = { total: 12, profilesReady: 9, needUpdates: -27, approvalsPending: 33 };

function activity() {
  const board = [
    { id: 1, consultantName: "Alex Morgan", kind: "UPDATED", text: "updated resume to v3", at: ago(2 * H) },
    { id: 2, consultantName: "Emily Lawson", kind: "APPROVAL_REQUESTED", text: "submitted resume for approval", at: ago(4 * H) },
    { id: 3, consultantName: "David Kim", kind: "MARKED_FOR_UPDATE", text: "resume marked for update", at: ago(6 * H) },
    { id: 4, consultantName: "Priya Sharma", kind: "APPROVED", text: "resume approved", at: ago(24 * H) },
    { id: 5, consultantName: "Michael Park", kind: "CREATED", text: "uploaded a new resume (v4)", at: ago(26 * H) },
  ].map((a, i) => ({ ...a, resumeId: i + 1, consultantId: i + 1, avatarUrl: `/ent/marketer/resumes/${a.consultantName.toLowerCase().replace(/ /g, "-")}.png` }));
  return [...state.events, ...board].slice(0, 5);
}

function list(url) {
  const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
  const skill = (url.searchParams.get("skill") ?? "").toLowerCase();
  const status = url.searchParams.get("status") ?? "";
  const availability = (url.searchParams.get("availability") ?? "").toUpperCase().replace(/ /g, "_");
  const updated = url.searchParams.get("updated") ?? "all";
  const days = { "7d": 7, "30d": 30, "3m": 91, "6m": 183 }[updated];
  const [sortKey, dir] = (url.searchParams.get("sort") ?? "modified,desc").split(",");
  const size = Math.min(Math.max(Number(url.searchParams.get("size") ?? 10) || 10, 1), 100);
  const page = Math.max(Number(url.searchParams.get("page") ?? 0) || 0, 0);
  let rows = state.rows.filter(
    (r) =>
      (!q || `${r.consultantName} ${r.title} ${r.targetRole}`.toLowerCase().includes(q)) &&
      (!skill || r.skill.toLowerCase() === skill) &&
      (!status || r.approval === status.toUpperCase()) &&
      (!availability || r.availability === availability) &&
      (!days || Date.now() - Date.parse(r.lastModifiedAt) <= days * DAY),
  );
  const key = { modified: "lastModifiedAt", consultant: "consultantName", title: "title", version: "version", completeness: "completeness", approval: "approval" }[sortKey] ?? "lastModifiedAt";
  const sign = (dir ?? "desc") === "asc" ? 1 : -1;
  rows = [...rows].sort((a, b) => (a[key] < b[key] ? -sign : a[key] > b[key] ? sign : a.id - b.id));
  const count = (f) => state.rows.filter(f).length;
  const counts = { total: state.rows.length, profilesReady: count((r) => r.approval === "APPROVED"), needUpdates: count((r) => r.approval === "NEEDS_UPDATE"), approvalsPending: count((r) => r.approval === "PENDING") };
  return {
    kpis: Object.keys(counts).map((k) => ({ key: k, value: counts[k], deltaPct: DELTA[k], sparkline: [...SPARK[k].slice(0, 7), counts[k]] })),
    items: rows.slice(page * size, page * size + size).map(publicRow),
    total: rows.length,
    page,
    size,
    skills: [...new Set(state.rows.map((r) => r.skill))].sort(),
    activity: activity(),
    canApprove: false,
  };
}

const detail = (r) => ({
  row: publicRow(r),
  headline: r.headline ?? `${r.targetRole} with 8+ years of delivery experience`,
  summary: r.summary ?? "Hands-on consultant who ships reliable work for enterprise clients and mentors junior teammates.",
  fileName: null,
  fileSizeKb: null,
  skills: [{ name: r.skill, primary: true }, { name: "Agile", primary: false }, { name: "Communication", primary: false }],
  experience: EXPERIENCE,
  history: state.events.filter((e) => e.resumeId === r.id).slice(0, 10),
});

export function createMktResumesMock({ json, subOf = () => null }) {
  return function handle(req, res, path, method) {
    const m = /^\/api\/orgs\/(\d+)\/mkt\/resumes(?:\/(\d+)(?:\/(download|approval-request|needs-update|approve))?)?$/.exec(path);
    if (!m) return false;
    const login = subOf(req);
    const reply = (status, body) => (json(res, status, body), true);
    const finish = (fn) => {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => fn(raw ? JSON.parse(raw) : {}));
      return true;
    };
    if (Number(m[1]) !== 2 || !login || !MEMBERS.has(login)) {
      req.resume();
      return reply(404, { status: 404, code: "NOT_FOUND" });
    }
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.searchParams.get("__reset") === "1") reset();
    if (!m[2]) {
      req.resume();
      return method === "GET" ? reply(200, list(url)) : reply(405, { status: 405 });
    }
    const row = state.rows.find((r) => r.id === Number(m[2]));
    if (!row) {
      req.resume();
      return reply(404, { status: 404, code: "NOT_FOUND" });
    }
    const note = (kind, text) => {
      state.events.unshift({ id: state.nextEvent++, resumeId: row.id, consultantId: row.consultantId, consultantName: row.consultantName, avatarUrl: row.avatarUrl, kind, text, at: new Date().toISOString() });
    };
    if (m[3] === "download") {
      req.resume();
      return reply(404, { status: 404, code: "NO_FILE_STORED", message: "No file is stored for this resume.", detail: "No file is stored for this resume." });
    }
    if (m[3] === "approve") {
      req.resume();
      return reply(404, { status: 404, code: "NOT_FOUND" }); // a marketer can never approve
    }
    if (m[3] === "approval-request" && method === "POST") {
      req.resume();
      if (row.approval !== "PENDING") {
        row.approval = "PENDING";
        note("APPROVAL_REQUESTED", "resume sent for approval");
      }
      return reply(200, detail(row));
    }
    if (m[3] === "needs-update" && method === "POST") {
      return finish(() => {
        if (row.approval !== "NEEDS_UPDATE" && row.approval !== "PENDING") {
          row.approval = "NEEDS_UPDATE";
          note("MARKED_FOR_UPDATE", "resume marked for update");
        }
        reply(200, detail(row));
      });
    }
    if (!m[3] && method === "GET") {
      req.resume();
      return reply(200, detail(row));
    }
    if (!m[3] && method === "PATCH") {
      return finish((body) => {
        const keys = Object.keys(body);
        if (!keys.length || keys.some((k) => !["title", "headline", "summary", "targetRole"].includes(k))) return reply(422, { status: 422, code: "ORG_INVALID", detail: "body: name at least one field to change" });
        if ("title" in body && !String(body.title ?? "").trim()) return reply(422, { status: 422, code: "ORG_INVALID", detail: "title: is required" });
        let changed = false;
        for (const k of keys) {
          const next = body[k] === null ? null : String(body[k]).trim();
          const cur = k === "title" ? row.title : row[k];
          if (next !== cur) changed = true;
          if (k === "title") row.title = next;
          else row[k] = next;
        }
        if (changed) {
          row.version += 1;
          row.approval = "PENDING";
          row.lastModifiedAt = new Date().toISOString();
          note("UPDATED", `updated resume to v${row.version}`);
        }
        return reply(200, detail(row));
      });
    }
    req.resume();
    return reply(405, { status: 405 });
  };
}

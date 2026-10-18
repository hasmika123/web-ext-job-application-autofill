/**
 * Dev mock for `/api/orgs/{orgId}/mkt/jobs/**` (Marketing workspace, Job Discovery), in memory, DEV ONLY. The rows are the approved
 * "Job Discovery" board, so the page can be compared to it side by side: the eight table rows, 342 openings in all, the five tiles,
 * Trending Skills, Top Clients Hiring, Recent Job Alerts, twelve Saved Searches and five Watched Job Streams. Only acme (id 2)
 * members who hold the marketing grants see it; anyone else gets the API's 404. Assign and saved-search writes are kept in memory.
 */
const MEMBERS = new Set(["marketer@acme.com", "sarah@acme.com", "demo-ent-acme-omar", "demo-ent-acme-sarah"]);
const ART = "/ent/marketer/jobs";
const H = 3600e3;
const ago = (ms) => new Date(Date.now() - ms).toISOString();

const CLIENT_LOGO = { TechCorp: "techcorp", "Global Bank": "global-bank", CloudScale: "cloudscale", HealthPlus: "healthplus", NovaGen: "novagen", FinServe: "finserve", RetailWorks: "retailworks", "Acme Health": "acme-health" };
const logo = (name) => (CLIENT_LOGO[name] ? `${ART}/client-${CLIENT_LOGO[name]}.png` : null);

const BOARD = [
  { title: "Senior Java Developer", client: "TechCorp", location: "New York, NY", rate: [9000, 11000], source: "LinkedIn Jobs", hours: 2, priority: "HIGH", skills: ["Java", "Spring Boot", "AWS"], mode: "HYBRID" },
  { title: "Data Analyst", client: "Global Bank", location: "Remote", rate: [6000, 7500], source: "Indeed", hours: 3, priority: "MEDIUM", skills: ["SQL", "Python", "Tableau"], mode: "REMOTE" },
  { title: "AWS Cloud Engineer", client: "CloudScale", location: "Austin, TX", rate: [9500, 12000], source: "Dice", hours: 4, priority: "HIGH", skills: ["AWS", "DevOps", "Kubernetes"], mode: "ON_SITE" },
  { title: "Business Analyst", client: "HealthPlus", location: "Chicago, IL", rate: [7000, 9000], source: "ZipRecruiter", hours: 5, priority: "MEDIUM", skills: ["SQL", "Analyst", "Agile"], mode: "HYBRID" },
  { title: "Project Manager (PMP)", client: "NovaGen", location: "Remote", rate: [8500, 10500], source: "Client Portal", hours: 6, priority: "HIGH", skills: ["PMP", "Agile", "Scrum"], mode: "REMOTE" },
  { title: ".NET Developer", client: "FinServe", location: "Charlotte, NC", rate: [7500, 9500], source: "LinkedIn Jobs", hours: 8, priority: "MEDIUM", skills: [".NET", "C#", "Azure"], mode: "ON_SITE" },
  { title: "QA Automation Engineer", client: "RetailWorks", location: "Dallas, TX", rate: [6500, 8500], source: "Indeed", hours: 10, priority: "LOW", skills: ["Selenium", "Cypress", "Java"], mode: "HYBRID" },
  { title: "Salesforce Developer", client: "Acme Health", location: "San Francisco, CA", rate: [9000, 12000], source: "Dice", hours: 12, priority: "HIGH", skills: ["Salesforce", "Apex", "LWC"], mode: "HYBRID" },
];
const TOTAL = 342;
const VISAS = ["Any visa", "US Citizen / Green Card", "H-1B transfer", "OPT / CPT"];

const rateLabel = ([a, b]) => `$${a / 100} - $${b / 100}/hr`;
const jobAt = (i) => {
  const b = BOARD[i % BOARD.length];
  const lap = Math.floor(i / BOARD.length);
  return {
    id: 1000 + i,
    title: b.title,
    client: { id: 1 + (i % BOARD.length), name: b.client, logoUrl: logo(b.client) },
    location: b.location,
    workMode: b.mode,
    rateLabel: rateLabel(b.rate),
    rate: { min: b.rate[0], max: b.rate[1], unit: "HOUR", currency: "USD" },
    source: b.source,
    postedAt: ago((b.hours + lap * 9) * H),
    priority: b.priority,
    visa: VISAS[i % VISAS.length],
    skills: b.skills,
    positions: 1,
    status: "OPEN",
  };
};
const ALL = Array.from({ length: TOTAL }, (_, i) => jobAt(i));

const SEARCHES = [
  ["Java Developers - East Coast", { skills: ["Java", "Spring", "AWS"], location: "NY, NJ, PA" }, 24],
  ["Data & Analytics Roles", { skills: ["Python", "SQL", "Tableau"], location: "Remote" }, 18],
  ["AWS Cloud Roles", { skills: ["AWS", "DevOps"], location: "Nationwide" }, 32],
  ["Project Managers (PMP)", { skills: ["PMP", "Agile"], location: "Remote" }, 12],
  [".NET Opportunities", { skills: [".NET", "C#"], location: "US" }, 16],
  ["Salesforce Roles", { skills: ["Salesforce", "Apex"], location: "Remote" }, 9],
  ["QA Automation", { skills: ["Selenium", "Cypress"], location: "Dallas, TX" }, 7],
  ["Business Analysts - Healthcare", { skills: ["SQL", "Analyst"], location: "Chicago, IL" }, 6],
  ["DevOps Contract", { skills: ["Kubernetes", "Terraform"], location: "Remote" }, 5],
  ["Data Engineers", { skills: ["Spark", "Airflow"], location: "Remote" }, 4],
  ["React Front-end", { skills: ["React", "TypeScript"], location: "Remote" }, 3],
  ["Scrum Masters", { skills: ["Scrum", "JIRA"], location: "Remote" }, 0],
];
const searches = SEARCHES.map(([name, c, n], i) => ({ id: i + 1, name, criteria: { q: null, skills: c.skills, location: c.location, workType: null, visa: null, source: null, rateMin: null, rateMax: null }, newCount: n }));
let nextSearch = 100;

const PEOPLE = [
  { consultantId: 1, name: "Alex Morgan", title: "Java Developer", availability: "AVAILABLE", score: 92, matchStatus: "SUGGESTED" },
  { consultantId: 2, name: "Priya Sharma", title: "Business Analyst", availability: "NOTICE", score: 85, matchStatus: null },
  { consultantId: 3, name: "Michael Park", title: "AWS Engineer", availability: "AVAILABLE", score: 78, matchStatus: null },
  { consultantId: 4, name: "Emily Lawson", title: "Project Manager", availability: "NOTICE", score: null, matchStatus: null },
  { consultantId: 5, name: "David Kim", title: "Data Analyst", availability: "AVAILABLE", score: 74, matchStatus: null },
];
const assigned = new Set();

const spark = (arr) => arr;
const view = (page, size, f) => {
  let rows = ALL;
  if (f.q) rows = rows.filter((j) => `${j.title} ${j.client.name} ${j.skills.join(" ")}`.toLowerCase().includes(f.q.toLowerCase()));
  if (f.source) rows = rows.filter((j) => j.source === f.source);
  if (f.location) rows = rows.filter((j) => j.location.toLowerCase().includes(f.location.toLowerCase()));
  if (f.workType) rows = rows.filter((j) => j.workMode === f.workType);
  if (f.visa) rows = rows.filter((j) => j.visa === f.visa);
  if (f.skills.length) rows = rows.filter((j) => j.skills.some((s) => f.skills.some((w) => w.toLowerCase() === s.toLowerCase())));
  if (f.sort === "posted_asc") rows = [...rows].reverse();
  if (f.sort === "title_asc") rows = [...rows].sort((a, b) => a.title.localeCompare(b.title));
  if (f.sort === "client_asc") rows = [...rows].sort((a, b) => a.client.name.localeCompare(b.client.name));
  return {
    kpis: {
      newToday: { value: 24, deltaPct: 26, sparkline: spark([10, 14, 12, 18, 16, 19, 21, 24]) },
      highMatch: { value: 56, deltaPct: 18, sparkline: spark([30, 36, 34, 42, 40, 46, 50, 56]) },
      assigned: { value: 32 + assigned.size, deltaPct: 14, sparkline: spark([14, 16, 19, 21, 24, 26, 29, 32]) },
      savedSearches: { value: 12, deltaPct: 50, sparkline: spark([4, 5, 6, 8, 8, 10, 11, 12]) },
    },
    items: rows.slice(page * size, page * size + size),
    total: rows.length,
    page,
    size,
    canAssign: true,
    facets: {
      skills: ["Java", "AWS", "Python", "SQL", "Project Management", "Spring Boot", "DevOps", "Kubernetes", "Salesforce", "Agile", "Scrum", ".NET", "C#", "Tableau"],
      locations: ["Austin, TX", "Charlotte, NC", "Chicago, IL", "Dallas, TX", "New York, NY", "Remote", "San Francisco, CA"],
      workTypes: ["ON_SITE", "HYBRID", "REMOTE"],
      visas: VISAS,
      sources: ["Client Portal", "Dice", "Indeed", "LinkedIn Jobs", "ZipRecruiter"],
    },
    trendingSkills: [
      { rank: 1, skill: "Java", openings: 128, deltaPct: 32, barPct: 100 },
      { rank: 2, skill: "AWS", openings: 112, deltaPct: 28, barPct: 88 },
      { rank: 3, skill: "Python", openings: 98, deltaPct: 20, barPct: 77 },
      { rank: 4, skill: "SQL", openings: 76, deltaPct: 18, barPct: 59 },
      { rank: 5, skill: "Project Management", openings: 64, deltaPct: 15, barPct: 50 },
    ],
    topClients: [
      { id: 1, name: "TechCorp", logoUrl: logo("TechCorp"), openings: 48, topSkills: ["Java", "AWS", "DevOps"], deltaPct: 40 },
      { id: 2, name: "Global Bank", logoUrl: logo("Global Bank"), openings: 36, topSkills: ["Data", "SQL", "Python"], deltaPct: 28 },
      { id: 3, name: "CloudScale", logoUrl: logo("CloudScale"), openings: 32, topSkills: ["AWS", "DevOps", "Kubernetes"], deltaPct: 22 },
      { id: 4, name: "HealthPlus", logoUrl: logo("HealthPlus"), openings: 28, topSkills: ["SQL", "Analyst", "PM"], deltaPct: 18 },
      { id: 5, name: "NovaGen", logoUrl: logo("NovaGen"), openings: 24, topSkills: ["Java", ".NET", "Agile"], deltaPct: 16 },
    ],
    alerts: [
      { id: "client-1", kind: "CLIENT", text: "24 new Java openings at TechCorp", at: ago(2 * H), clientId: 1, logoUrl: `${ART}/alert-java.png` },
      { id: "client-3", kind: "CLIENT", text: "12 new AWS roles (Remote)", at: ago(4 * H), clientId: 3, logoUrl: `${ART}/alert-aws.png` },
      { id: "client-2", kind: "CLIENT", text: "Global Bank posted 8 new Data Analyst roles", at: ago(6 * H), clientId: 2, logoUrl: `${ART}/alert-analyst.png` },
      { id: "search-4", kind: "SEARCH", text: "5 new Project Manager roles match your saved search", at: ago(9 * H), clientId: null, logoUrl: `${ART}/alert-pm.png` },
      { id: "client-4", kind: "CLIENT", text: "HealthPlus added 10 new IT roles", at: ago(24 * H), clientId: 4, logoUrl: `${ART}/alert-health.png` },
    ],
    savedSearches: searches,
    streams: [
      { clientId: 1, name: "TechCorp", subtitle: "All Openings", logoUrl: logo("TechCorp"), newThisWeek: 124, status: "Active" },
      { clientId: 2, name: "Global Bank", subtitle: "IT & Data", logoUrl: logo("Global Bank"), newThisWeek: 86, status: "Active" },
      { clientId: 3, name: "CloudScale", subtitle: "Cloud & DevOps", logoUrl: logo("CloudScale"), newThisWeek: 67, status: "Active" },
      { clientId: 4, name: "HealthPlus", subtitle: "Healthcare IT", logoUrl: logo("HealthPlus"), newThisWeek: 42, status: "Active" },
      { clientId: 9, name: "Client Portal", subtitle: "Enterprise", logoUrl: `${ART}/stream-db.png`, newThisWeek: 106, status: "Active" },
    ],
  };
};

export function createMktJobsMock({ json, subOf = () => null }) {
  return function handle(req, res, path, method) {
    const m = /^\/api\/orgs\/(\d+)\/mkt\/jobs(?:\/(saved-searches)(?:\/(\d+)(?:\/(seen))?)?|\/(\d+)(?:\/(candidates|assign))?)?$/.exec(path.split("?")[0]);
    if (!m) return false;
    const login = subOf(req);
    const denied = Number(m[1]) !== 2 || !login || !MEMBERS.has(login);
    const body = () =>
      new Promise((resolve) => {
        let raw = "";
        req.on("data", (c) => (raw += c));
        req.on("end", () => {
          try {
            resolve(JSON.parse(raw || "{}"));
          } catch {
            resolve({});
          }
        });
      });
    if (denied) return req.resume(), json(res, 404, { status: 404, code: "NOT_FOUND" }), true;
    const url = new URL(req.url, "http://mock");
    const [, , savedKind, savedId, seen, jobId, sub] = m;

    if (savedKind) {
      if (method === "POST" && !savedId) {
        void body().then((b) => {
          if (!b.name || !String(b.name).trim()) return json(res, 422, { status: 422, code: "ORG_INVALID", detail: "Give the search a name." });
          const s = { id: nextSearch++, name: String(b.name).trim(), criteria: { q: null, skills: [], location: null, workType: null, visa: null, source: null, rateMin: null, rateMax: null, ...(b.criteria || {}) }, newCount: 0 };
          searches.unshift(s);
          return json(res, 201, s);
        });
        return true;
      }
      req.resume();
      const idx = searches.findIndex((s) => s.id === Number(savedId));
      if (idx < 0) return json(res, 404, { status: 404, code: "NOT_FOUND" }), true;
      if (method === "POST" && seen) return searches[idx].newCount = 0, res.writeHead(204).end(), true;
      if (method === "DELETE") return searches.splice(idx, 1), res.writeHead(204).end(), true;
      return json(res, 405, { status: 405 }), true;
    }

    if (jobId && sub === "assign") {
      if (method !== "POST") return req.resume(), json(res, 405, { status: 405 }), true;
      void body().then((b) => {
        const p = PEOPLE.find((c) => c.consultantId === b.consultantId);
        if (!p) return json(res, 404, { status: 404, code: "NOT_FOUND" });
        const key = `${jobId}:${p.consultantId}`;
        const created = !assigned.has(key);
        assigned.add(key);
        p.matchStatus = "ASSIGNED";
        return json(res, 200, { matchId: 500 + assigned.size, requirementId: Number(jobId), consultantId: p.consultantId, status: "ASSIGNED", score: p.score ?? 0, created });
      });
      return true;
    }
    req.resume();
    if (method !== "GET") return json(res, 405, { status: 405 }), true;
    if (jobId && sub === "candidates") {
      const q = (url.searchParams.get("q") || "").toLowerCase();
      return json(res, 200, PEOPLE.filter((p) => p.name.toLowerCase().includes(q))), true;
    }
    if (jobId) {
      const job = ALL.find((j) => j.id === Number(jobId));
      if (!job) return json(res, 404, { status: 404, code: "NOT_FOUND" }), true;
      return json(res, 200, {
        job,
        description: "Design and build services for a client engagement. Work with the client's engineering team, own delivery of well-tested features and take part in on-call rotation.",
        employment: "CONTRACT",
        duration: "6 months",
        experienceLevel: "SENIOR",
        matches: PEOPLE.filter((p) => p.score).slice(0, 3).map((p) => ({ consultantId: p.consultantId, name: p.name, score: p.score, status: p.matchStatus ?? "SUGGESTED" })),
      }), true;
    }
    const q = url.searchParams;
    const size = Math.min(100, Number(q.get("size")) || 8);
    return json(res, 200, view(Math.max(0, Number(q.get("page")) || 0), size, {
      q: q.get("q") || "", source: q.get("source") || "", location: q.get("location") || "", workType: q.get("workType") || "", visa: q.get("visa") || "",
      skills: (q.get("skills") || "").split(",").filter(Boolean), sort: q.get("sort") || "",
    })), true;
  };
}

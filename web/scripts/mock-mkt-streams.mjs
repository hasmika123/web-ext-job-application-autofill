/**
 * Dev mock for `/api/orgs/{orgId}/mkt/streams` (Marketing workspace, Job Streams), in memory, DEV ONLY. The rows are the approved
 * "Job Streams" board, so the page can be compared with it side by side. Only acme (id 2) members who hold the marketing grants see it;
 * anyone else gets the API's 404. Writes only record settings (like the real API); nothing is fetched from any site.
 */
const MEMBERS = new Set(["marketer@acme.com", "sarah@acme.com", "demo-ent-acme-omar", "demo-ent-acme-sarah"]);
const MIN = 60e3;
const H = 60 * MIN;
const DAY = 24 * H;
const ago = (ms) => new Date(Date.now() - ms).toISOString();

const SPECS = [
  { id: 1, sourceLabel: "LinkedIn Jobs", subtitle: "Global Talent Solutions", syncEveryMinutes: 30, keywords: ["Java", "AWS", "Cloud", "Data Engineer", "Spring Boot", "Kubernetes", "React"], clientScope: null, mins: 10, newOpenings: 124, delta: 12 },
  { id: 2, sourceLabel: "Indeed", subtitle: "Worldwide", syncEveryMinutes: 60, keywords: ["Data Analyst", "Business Analyst", "SQL", "Tableau"], clientScope: null, mins: 25, newOpenings: 86, delta: 8 },
  { id: 3, sourceLabel: "Dice", subtitle: "Tech & Cleared", syncEveryMinutes: 120, keywords: ["Java Developer", "DevOps", "Azure", "AWS", "Terraform", "Docker", "Kubernetes"], clientScope: null, mins: 60, newOpenings: 48, delta: 5 },
  { id: 4, sourceLabel: "ZipRecruiter", subtitle: "All Locations", syncEveryMinutes: 60, keywords: ["Project Manager", "IT Consultant", "PMP", "Agile", "Scrum"], clientScope: null, mins: 120, newOpenings: 32, delta: 3 },
  { id: 5, sourceLabel: "Client Portal", subtitle: "ACME Clients", syncEveryMinutes: 30, keywords: ["Client Specific (Requisitions)"], clientScope: "ACME Clients", mins: 30, newOpenings: 67, delta: 15 },
  { id: 6, sourceLabel: "Vendor Feed", subtitle: "Partner Integration", syncEveryMinutes: 240, keywords: ["Multiple Clients (Open Roles)"], clientScope: "Partner Clients", mins: 180, newOpenings: 45, delta: 9 },
];

function seed() {
  const streams = SPECS.map((s) => ({
    id: s.id, sourceLabel: s.sourceLabel, subtitle: s.subtitle, status: "ACTIVE", active: true, syncEveryMinutes: s.syncEveryMinutes, keywords: s.keywords,
    clientScope: s.clientScope, lastSyncAt: ago(s.mins * MIN), newOpenings: s.newOpenings, openingsDeltaPct: s.delta,
  }));
  const logs = [];
  let id = 1;
  for (let d = 0; d < 7; d++) {
    for (const s of SPECS) logs.push({ id: id++, streamId: s.id, source: s.sourceLabel, syncedAt: new Date(Date.now() - s.mins * MIN - d * DAY).toISOString(), openings: Math.round(s.newOpenings * (d === 0 ? 1 : 1 - 0.03 * d)), status: "OK", message: "Sync completed" });
  }
  logs.sort((a, b) => b.syncedAt.localeCompare(a.syncedAt));
  return {
    streams,
    logs,
    nextId: 7,
    alerts: [
      { id: 1, severity: "ERROR", title: "Vendor Feed sync failed", detail: "Connection timeout. Retrying in 15 minutes.", raisedAt: ago(2 * H) },
      { id: 2, severity: "WARNING", title: "3 duplicate jobs detected", detail: "Similar titles from Indeed", raisedAt: ago(4 * H) },
      { id: 3, severity: "WARNING", title: "Keyword filter too broad", detail: "\"Developer\" returning high volume", raisedAt: ago(26 * H) },
      { id: 4, severity: "WARNING", title: "Client Portal slow response", detail: "Sync taking longer than usual", raisedAt: ago(30 * H) },
    ],
    rules: [
      { key: "DEFAULT_KEYWORDS", enabled: true, value: "Java, AWS, Cloud, Data Engineer" },
      { key: "CLIENT_MAPPING", enabled: true, value: "Map each opening to the client named in the requisition." },
      { key: "DUPLICATE_DETECTION", enabled: true, value: "Same title and client within 14 days counts as a duplicate." },
      { key: "AUTO_PUBLISH", enabled: true, value: "Sync new openings to talent matches." },
    ],
  };
}

const spark = (arr) => arr;
function view(db, url) {
  const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
  const source = url.searchParams.get("source");
  const status = url.searchParams.get("status");
  const client = url.searchParams.get("client");
  const showInactive = url.searchParams.get("showInactive") === "true" || status === "PAUSED";
  const days = url.searchParams.get("days") === "14" ? 14 : 7;
  let rows = db.streams.filter((s) => showInactive || s.active);
  if (source) rows = rows.filter((s) => s.sourceLabel.toLowerCase() === source.toLowerCase());
  if (status) rows = rows.filter((s) => s.status === status);
  if (client) rows = rows.filter((s) => !s.clientScope || s.clientScope === client);
  if (q) rows = rows.filter((s) => [s.sourceLabel, s.subtitle, s.keywords.join(" "), s.clientScope].join(" ").toLowerCase().includes(q));
  const labels = [];
  const dayList = [];
  for (let i = days - 1; i >= 0; i--) dayList.push(new Date(Date.now() - i * DAY).toISOString().slice(0, 10));
  for (const s of db.streams) {
    const values = dayList.map((d) => db.logs.filter((l) => l.streamId === s.id && l.syncedAt.slice(0, 10) === d).reduce((n, l) => n + l.openings, 0));
    if (values.some((v) => v > 0)) labels.push({ key: `s${s.id}`, label: s.sourceLabel, values });
  }
  return {
    kpis: [
      { key: "activeStreams", value: db.streams.filter((s) => s.active).length, deltaPct: 20, sparkline: spark([4, 4, 5, 5, 5, 5, 6, 6]) },
      { key: "syncHealth", value: 100, deltaPct: 5, sparkline: spark([95, 95, 100, 95, 100, 100, 100, 100]) },
      { key: "newOpenings", value: 362, deltaPct: 18, sparkline: spark([220, 260, 240, 300, 280, 330, 340, 362]) },
      { key: "streamErrors", value: db.alerts.length, deltaPct: -56, sparkline: spark([5, 4, 6, 3, 4, 2, 3, db.alerts.length]) },
    ],
    streams: { items: rows, total: rows.length, page: 0, size: 25 },
    filters: { sources: db.streams.map((s) => s.sourceLabel), statuses: ["ACTIVE", "PAUSED", "ERROR"], clients: [...new Set(db.streams.map((s) => s.clientScope).filter(Boolean))] },
    activity: db.logs.slice(0, 20),
    chart: { days: dayList, series: labels },
    alerts: db.alerts,
    rules: db.rules,
  };
}

const keywordsOf = (text) => (typeof text === "string" ? text.split(",").map((k) => k.trim()).filter(Boolean) : []);

export function createMktStreamsMock({ json, subOf = () => null }) {
  const db = seed();
  return function handle(req, res, path, method) {
    const m = /^\/api\/orgs\/(\d+)\/mkt\/streams(\/.*)?$/.exec(path);
    if (!m) return false;
    const login = subOf(req);
    const sub = m[2] ?? "";
    const denied = Number(m[1]) !== 2 || !login || !MEMBERS.has(login);
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      if (denied) return void json(res, 404, { status: 404, code: "NOT_FOUND" });
      let body = {};
      try {
        body = raw ? JSON.parse(raw) : {};
      } catch {
        return void json(res, 400, { status: 400, detail: "Bad JSON" });
      }
      if (method === "GET" && sub === "") return void json(res, 200, view(db, new URL(req.url, "http://x")));
      if (method === "POST" && sub === "") {
        const label = String(body.sourceLabel ?? "").trim();
        if (!label) return void json(res, 400, { status: 400, detail: "sourceLabel is required" });
        if (db.streams.some((s) => s.sourceLabel.toLowerCase() === label.toLowerCase())) return void json(res, 400, { status: 400, detail: "a stream with this name already exists" });
        const s = { id: db.nextId++, sourceLabel: label, subtitle: body.subtitle || null, status: "ACTIVE", active: true, syncEveryMinutes: body.syncEveryMinutes ?? 60, keywords: keywordsOf(body.keywords), clientScope: body.clientScope || null, lastSyncAt: null, newOpenings: 0, openingsDeltaPct: null };
        db.streams.push(s);
        return void json(res, 201, s);
      }
      const one = /^\/(\d+)(\/pause|\/resume)?$/.exec(sub);
      if (one) {
        const s = db.streams.find((x) => x.id === Number(one[1]));
        if (!s) return void json(res, 404, { status: 404, code: "NOT_FOUND" });
        if (method === "PATCH" && !one[2]) {
          if (body.sourceLabel !== undefined) s.sourceLabel = String(body.sourceLabel).trim() || s.sourceLabel;
          if (body.subtitle !== undefined) s.subtitle = body.subtitle || null;
          if (body.syncEveryMinutes !== undefined) s.syncEveryMinutes = body.syncEveryMinutes;
          if (body.keywords !== undefined) s.keywords = keywordsOf(body.keywords);
          if (body.clientScope !== undefined) s.clientScope = body.clientScope || null;
          return void json(res, 200, s);
        }
        if (method === "POST" && one[2]) {
          s.status = one[2] === "/pause" ? "PAUSED" : "ACTIVE";
          s.active = one[2] !== "/pause";
          return void json(res, 200, s);
        }
      }
      const rule = /^\/rules\/([A-Z_]+)$/.exec(sub);
      if (rule && method === "PATCH") {
        const r = db.rules.find((x) => x.key === rule[1]);
        if (!r) return void json(res, 404, { status: 404, code: "NOT_FOUND" });
        if (typeof body.enabled === "boolean") r.enabled = body.enabled;
        if (typeof body.value === "string") r.value = body.value.trim() || null;
        return void json(res, 200, r);
      }
      return void json(res, 405, { status: 405 });
    });
    return true;
  };
}

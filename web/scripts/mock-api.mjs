#!/usr/bin/env node
/**
 * Local demo mock of the Spring API (DEV ONLY).
 *
 * Lets you open the demo accounts on /login without MySQL or the Java API:
 *   npm run dev:demo -w web      (starts this on :8080 and `next dev` pointed at it)
 *
 * It answers just the endpoints the signed-in pages call, with realistic fixed data, and refuses every
 * write the way the real API does for a demo session (403 DEMO_READ_ONLY), EXCEPT the Resume Builder
 * document endpoints and the Common Profile item endpoints (below), which are writable in memory so the
 * editor and /profiles can be exercised. Nothing is persisted.
 * It lives outside `src/`, so it is never part of the Next bundle, and it refuses to start when
 * NODE_ENV=production.
 */
import http from "node:http";

if (process.env.NODE_ENV === "production") {
  console.error("mock-api: refusing to run with NODE_ENV=production");
  process.exit(1);
}

const PORT = Number(process.env.MOCK_API_PORT ?? 8080);
const DAY = 86_400_000;
const ago = (d) => new Date(Date.now() - d * DAY).toISOString();

const ACCOUNTS = {
  demo: {
    login: "demo",
    email: "demo@kiwiply.com",
    firstName: "Priya",
    lastName: "Sharma",
    authorities: ["ROLE_USER"],
    activated: true,
  },
  "demo-org": {
    login: "demo-org",
    email: "demo-org@kiwiply.com",
    firstName: "Anika",
    lastName: "Rao",
    authorities: ["ROLE_USER"],
    activated: true,
  },
  // LOCAL MOCK ONLY: the real API never makes a public demo account an admin.
  "demo-admin": {
    login: "demo-admin",
    email: "demo-admin@kiwiply.com",
    firstName: "Maya",
    lastName: "Chen",
    authorities: ["ROLE_ADMIN", "ROLE_USER"],
    activated: true,
  },
};

// Mirrors the real API's DEMO_ENABLED config flag: MOCK_DEMO_ENABLED=false turns the demo off (default on).
const DEMO_ENABLED = !/^(false|0|no|off)$/i.test(process.env.MOCK_DEMO_ENABLED ?? "true");

const DEMO_ACCOUNTS = [
  {
    login: "demo",
    label: "Job seeker (Priya Sharma)",
    description: "A ready-made job search: a profile, resumes and an application board.",
    landing: "/dashboard",
  },
  {
    login: "demo-org",
    label: "Organization admin",
    description: "The organization admin: people, boards and reports.",
    landing: "/org",
  },
  {
    login: "demo-admin",
    label: "App admin",
    description: "The platform admin console: users, analytics, system settings and the audit log.",
    landing: "/admin",
  },
];

const DEMO_INFO = { enabled: DEMO_ENABLED, accounts: DEMO_ENABLED ? DEMO_ACCOUNTS : [] };

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
/** Unsigned JWT-shaped token: the web app only decodes `exp` (proxy.ts) and forwards it back to us. */
const token = (sub, ttlSec) =>
  `${b64({ alg: "none", typ: "JWT" })}.${b64({ sub, exp: Math.floor(Date.now() / 1000) + ttlSec })}.mock`;
const pair = (sub) => ({ accessToken: token(sub, 15 * 60), refreshToken: `refresh.${sub}` });
const subOf = (req) => {
  const raw = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
  try {
    const sub = JSON.parse(Buffer.from(raw.split(".")[1] ?? "", "base64url").toString()).sub;
    return ACCOUNTS[sub] ? sub : null;
  } catch {
    return null;
  }
};

const app = (id, company, roleTitle, status, daysAgo, extra = {}) => ({
  id,
  company,
  roleTitle,
  status,
  location: "Remote",
  jobType: "FULL_TIME",
  jobMode: "REMOTE",
  atsPlatform: "GREENHOUSE",
  jobUrl: `https://example.com/jobs/${id}`,
  createdAt: ago(daysAgo + 1),
  appliedAt: status === "SAVED" || status === "DRAFT" ? null : ago(daysAgo),
  starred: false,
  archived: false,
  submissionConfirmed: status !== "SAVED" && status !== "DRAFT",
  resume: { id: 1, label: "Priya Sharma - Product Designer" },
  ...extra,
});
const APPLICATIONS = [
  app(1, "Stripe", "Senior Product Designer", "INTERVIEW", 3, { starred: true, salary: "$150k-$180k" }),
  app(2, "Figma", "Design Systems Designer", "APPLIED", 5),
  app(3, "Notion", "Product Designer, Growth", "APPLIED", 6),
  app(4, "Linear", "Product Designer", "OFFER", 12, { salary: "$165k" }),
  app(5, "Airbnb", "UX Designer", "REJECTED", 20),
  app(6, "Shopify", "Staff Product Designer", "SAVED", 2),
  app(7, "Atlassian", "Senior UX Designer", "SAVED", 1),
  app(8, "Canva", "Brand Designer", "DRAFT", 0),
];

const resumeJson = (focus) =>
  JSON.stringify({
    summary: focus
      ? "Design-systems focused product designer."
      : "Product designer with 7 years shipping consumer and B2B products.",
    skills: ["Figma", "Design systems", "User research", "Prototyping"],
    experience: [
      {
        company: "Northwind",
        title: "Senior Product Designer",
        location: "Remote",
        startDate: "2021-03",
        endDate: "",
        bullets: ["Led the redesign of onboarding, lifting activation 18%."],
      },
    ],
    education: [{ school: "NID Ahmedabad", degree: "B.Des", startDate: "2012", endDate: "2016" }],
  });
const RESUMES = [
  { id: 1, kind: "UPLOADED", label: "Priya Sharma - Product Designer", status: "CONFIRMED", createdAt: ago(40), defaultResume: true, starred: true, archived: false, parsedJson: resumeJson(false) },
  { id: 2, kind: "UPLOADED", label: "Priya Sharma - Design Systems focus", status: "CONFIRMED", createdAt: ago(12), defaultResume: false, starred: false, archived: false, parsedJson: resumeJson(true) },
  // Built resumes for the "My Resumes" board (docs are seeded below); id 4 has a stale exported PDF, id 5 is archived.
  { id: 3, kind: "BUILT", templateId: "modern", label: "Product Manager", status: "CONFIRMED", createdAt: ago(21), defaultResume: false, starred: false, archived: false, parsedJson: "{}" },
  { id: 4, kind: "BUILT", templateId: "modern", label: "Frontend Developer", status: "CONFIRMED", createdAt: ago(29), defaultResume: false, starred: false, archived: false, parsedJson: "{}" },
  { id: 5, kind: "UPLOADED", label: "AI/ML Engineer", status: "CONFIRMED", createdAt: ago(60), defaultResume: false, starred: false, archived: true, parsedJson: resumeJson(false) },
];

const BIO = {
  onboardedAt: ago(40),
  authorizedToWork: "Yes",
  firstName: "Priya",
  lastName: "Sharma",
  email: "demo@kiwiply.com",
  city: "Austin",
  state: "TX",
  country: "United States",
};

const json = (res, status, body) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
};

/** Read a small JSON body, then hand it to `cb` (empty object when unparseable). */
const withBody = (req, cb) => {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    let body = {};
    try {
      body = JSON.parse(raw);
    } catch {}
    cb(body);
  });
};

/* ── Resume Builder mock (R0.3 contract; in memory) ──────────────────────────────────────────── */
const DOCS = new Map(); // resume id -> { doc, templateId, theme, version, updatedAt }
let nextResumeId = 100;
const DATE_RX = /^(19|20)\d{2}(-(0[1-9]|1[0-2]))?$/;
const FREE_RESUME_LIMIT = 3;

const docId = (p) => `${p}_${Math.random().toString(36).slice(2, 10).padEnd(8, "0")}`;
const seedDoc = (title) => ({
  schema: 2,
  meta: { title, target: null, language: "en" },
  basics: { name: "Priya Sharma", headline: "Product Designer", email: "demo@kiwiply.com", location: "Austin, TX", links: [] },
  sections: [
    { id: "s_summary", kind: "SUMMARY", title: "Summary", items: [{ id: docId("i"), text: "Product designer with 7 years shipping consumer and B2B products.", src: "parsed" }] },
    {
      id: "s_experience",
      kind: "EXPERIENCE",
      title: "Experience",
      items: [
        {
          id: docId("i"), title: "Senior Product Designer", org: "Northwind", location: "Remote", start: "2021-03", end: null, current: true,
          bullets: [
            { id: docId("b"), text: "Led the redesign of onboarding, lifting activation 18%.", src: "parsed" },
            { id: docId("b"), text: "Built the design system used by 40 engineers.", src: "parsed" },
          ],
        },
      ],
    },
    { id: "s_education", kind: "EDUCATION", title: "Education", items: [{ id: docId("i"), school: "NID Ahmedabad", degree: "B.Des", start: "2012", end: "2016", bullets: [] }] },
    { id: "s_skills", kind: "SKILLS", title: "Skills", items: [{ id: docId("i"), group: "Design", skills: ["Figma", "Design systems", "User research"] }] },
  ],
});

DOCS.set(3, { doc: seedDoc("Product Manager"), templateId: "modern", theme: null, version: 2, updatedAt: ago(3) });
DOCS.set(4, { doc: seedDoc("Frontend Developer"), templateId: "modern", theme: null, version: 3, updatedAt: ago(9), exportedHash: "stale-hash", exportedAt: ago(12) });

/** The first validation problem (path + message), mirroring the server's date rule and limits. */
function firstProblem(doc) {
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) return { path: "$", message: "must be an object" };
  if (typeof doc.meta?.title !== "string") return { path: "$.meta.title", message: "must be a string" };
  if (!Array.isArray(doc.sections)) return { path: "$.sections", message: "must be an array" };
  for (const [si, s] of doc.sections.entries()) {
    for (const [ii, it] of (s.items ?? []).entries()) {
      for (const f of ["start", "end", "date"]) {
        const v = it[f];
        if (typeof v === "string" && v !== "" && !DATE_RX.test(v)) return { path: `$.sections[${si}].items[${ii}].${f}`, message: "must be YYYY or YYYY-MM" };
      }
      for (const [bi, b] of (it.bullets ?? []).entries()) {
        if (typeof b.text === "string" && b.text.length > 600) return { path: `$.sections[${si}].items[${ii}].bullets[${bi}].text`, message: "must be at most 600 characters" };
      }
    }
  }
  return null;
}

function docDto(id) {
  const d = DOCS.get(id);
  const r = RESUMES.find((x) => x.id === id);
  return {
    resumeId: id, label: r?.label ?? d.doc.meta.title, kind: "BUILT", doc: d.doc, templateId: d.templateId, theme: d.theme,
    schemaVersion: 2, docVersion: d.version, contentHash: `mock-${d.version}`, profileSyncedAt: null, exportedAt: d.exportedAt ?? null, exportedHash: d.exportedHash ?? null, updatedAt: d.updatedAt,
  };
}
const withEtag = (res, status, body, version) => {
  res.writeHead(status, { "content-type": "application/json", ...(version != null ? { etag: `"${version}"` } : {}) });
  res.end(JSON.stringify(body));
};
const problem = (res, status, code, extra = {}) => json(res, status, { status, code, title: code, message: "error.resumeDoc", ...extra });

/** Handles the builder endpoints; returns true when the request was answered. */
function handleBuilder(req, res, path, method) {
  const isBuilder =
    path === "/api/profile/resumes/built" ||
    /^\/api\/profile\/resumes\/\d+\/(doc(\/template)?|export-recorded)$/.test(path) ||
    /^\/api\/resumes\/\d+\/file$/.test(path) ||
    /^\/mock\/resumes\/\d+\/edit-elsewhere$/.test(path);
  if (!isBuilder) return false;
  const isMock = path.startsWith("/mock/");
  if (!isMock && !subOf(req)) {
    req.resume();
    json(res, 401, { error: "Unauthorized" });
    return true;
  }
  const id = Number(path.match(/\/resumes\/(\d+)/)?.[1]);

  if (path === "/api/profile/resumes/built" && method === "POST") {
    withBody(req, (b) => {
      if (RESUMES.filter((r) => !r.archived).length >= FREE_RESUME_LIMIT) {
        return json(res, 402, { status: 402, code: "RESUME_LIMIT", detail: "Free accounts keep up to 3 resumes — archive one, or upgrade to Pro.", plan: "FREE", limit: FREE_RESUME_LIMIT, count: FREE_RESUME_LIMIT });
      }
      const title = String(b.label || b.target || "My resume").slice(0, 200);
      const rid = nextResumeId++;
      const resume = { id: rid, kind: "BUILT", templateId: b.templateId || "modern", label: title, status: "CONFIRMED", createdAt: new Date().toISOString(), defaultResume: false, starred: false, archived: false, parsedJson: "{}" };
      RESUMES.push(resume);
      DOCS.set(rid, { doc: seedDoc(title), templateId: resume.templateId, theme: null, version: 1, updatedAt: new Date().toISOString() });
      withEtag(res, 201, { resume, doc: docDto(rid) }, 1);
    });
    return true;
  }

  const d = DOCS.get(id);

  // R0.6: the export route uploads the PDF here (multipart; the mock keeps only its size) ...
  if (/^\/api\/resumes\/\d+\/file$/.test(path) && method === "POST") {
    let bytes = 0;
    req.on("data", (c) => (bytes += c.length));
    req.on("end", () => {
      if (!d) return json(res, 404, { status: 404, title: "Not Found" });
      d.fileBytes = bytes;
      const r = RESUMES.find((x) => x.id === id);
      if (r) r.r2ObjectKey = `mock/${id}-export.pdf`;
      res.writeHead(200);
      res.end();
    });
    return true;
  }

  // ... and records the export afterwards (same contract as ResumeDocResource#exportRecorded).
  if (path.endsWith("/export-recorded") && method === "POST") {
    withBody(req, (b) => {
      if (!d) return json(res, 404, { status: 404, title: "Not Found" });
      if (typeof b.hash !== "string" || !b.hash) return problem(res, 422, "DOC_INVALID", { path: "$.hash", message: "must be a content hash" });
      d.exportedHash = b.hash;
      d.exportedAt = new Date().toISOString();
      res.writeHead(204);
      res.end();
    });
    return true;
  }

  if (isMock && method === "POST") {
    req.resume();
    if (!d) {
      json(res, 404, { error: "no such built resume" });
      return true;
    }
    d.version += 1;
    d.updatedAt = new Date().toISOString();
    const sum = d.doc.sections.find((s) => s.kind === "SUMMARY");
    if (sum?.items[0]) sum.items[0].text = "Edited elsewhere (from another tab).";
    json(res, 200, { ok: true, version: d.version });
    return true;
  }

  if (!d) {
    req.resume();
    json(res, 404, { status: 404, title: "Not Found" });
    return true;
  }

  if (method === "GET") {
    req.resume();
    withEtag(res, 200, docDto(id), d.version);
    return true;
  }

  if (method === "PUT" && path.endsWith("/doc")) {
    withBody(req, (b) => {
      const ifMatch = req.headers["if-match"];
      if (!ifMatch) return problem(res, 428, "IF_MATCH_REQUIRED");
      if (Number(String(ifMatch).replace(/[^0-9]/g, "")) !== d.version) {
        return problem(res, 409, "DOC_VERSION_CONFLICT", { serverVersion: d.version, doc: d.doc });
      }
      const bad = firstProblem(b.doc);
      if (bad) return problem(res, 422, "DOC_INVALID", bad);
      d.doc = b.doc;
      if (b.theme && typeof b.theme === "object") d.theme = b.theme;
      d.version += 1;
      d.updatedAt = new Date().toISOString();
      const r = RESUMES.find((x) => x.id === id);
      if (r) r.label = d.doc.meta.title;
      withEtag(res, 200, docDto(id), d.version);
    });
    return true;
  }

  if (method === "PATCH" && path.endsWith("/doc/template")) {
    withBody(req, (b) => {
      if (b.templateId !== "modern") return problem(res, 422, "DOC_INVALID", { path: "$.templateId", message: "unknown template" });
      d.templateId = b.templateId;
      d.version += 1;
      d.updatedAt = new Date().toISOString();
      withEtag(res, 200, docDto(id), d.version);
    });
    return true;
  }

  req.resume();
  json(res, 405, { error: "Method not allowed" });
  return true;
}

/* ── Common Profile items mock (R1.1 contract; in memory, writable like the builder) ─────────────── */
// Seeded the way the real API does it on first read: from the default resume (provenance PARSED).
const bullet = (text) => ({ text, src: "parsed" });
let nextItemId = 1;
const ITEMS = [
  { section: "EXPERIENCE", data: { title: "Senior Product Designer", org: "Northwind", location: "Remote", start: "2021-03", current: true, bullets: [bullet("Led the redesign of onboarding, lifting activation 18%."), bullet("Built the design system used by 40 engineers.")] } },
  { section: "EXPERIENCE", data: { title: "Product Designer", org: "Contoso", location: "Austin, TX", start: "2018-06", end: "2021-02", bullets: [bullet("Shipped the first mobile app.")] } },
  { section: "EDUCATION", data: { school: "NID Ahmedabad", degree: "B.Des", field: "Industrial Design", start: "2012", end: "2016" } },
  { section: "SKILL", data: { group: "Design", skills: ["Figma", "Design systems", "User research"] } },
  { section: "PROJECT", data: { title: "Open-source icon set", bullets: [bullet("1.2k stars on GitHub.")] } },
  { section: "LANGUAGE", data: { name: "English", level: "Fluent" } },
].map((s, i) => ({ id: nextItemId++, section: s.section, position: i, data: s.data, provenance: "PARSED", sourceResumeId: 1, hidden: false, updatedAt: ago(40) }));

const SENSITIVE_SSN = /(?<![A-Za-z0-9])\d{3}-\d{2}-\d{4}(?![A-Za-z0-9])/;
/** First string in `value` that looks like an SSN, as a dotted path (the real check is SensitivePatterns). */
function findSensitive(value, path) {
  if (typeof value === "string") return SENSITIVE_SSN.test(value) ? path : null;
  if (Array.isArray(value)) {
    for (const [i, v] of value.entries()) {
      const hit = findSensitive(v, `${path}[${i}]`);
      if (hit) return hit;
    }
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      const hit = findSensitive(v, `${path}.${k}`);
      if (hit) return hit;
    }
  }
  return null;
}

function completeness() {
  const filled = (k) => typeof BIO[k] === "string" && BIO[k].trim() !== "";
  const live = ITEMS;
  const skillNames = new Set(live.filter((i) => i.section === "SKILL").flatMap((i) => i.data.skills ?? []).map((s) => String(s).toLowerCase()));
  const defs = [
    ["identity", 15, "Complete your name, email and phone", "personal", filled("firstName") && filled("lastName") && filled("email") && filled("phone")],
    ["location", 5, "Add your city and country", "personal", filled("city") && filled("country")],
    ["headline", 5, "Add a headline", "personal", filled("headline")],
    ["summary", 10, "Write a short summary", "personal", filled("summary")],
    ["experience", 25, "Add a role with two or more bullet points", "work", live.some((i) => i.section === "EXPERIENCE" && (i.data.bullets ?? []).filter((b) => b.text?.trim()).length >= 2)],
    ["education", 10, "Add your education", "education", live.some((i) => i.section === "EDUCATION")],
    ["skills", 15, "Add at least five skills", "skills", skillNames.size >= 5],
    ["links", 5, "Add a link (LinkedIn, GitHub or a website)", "personal", filled("linkedin") || filled("github") || filled("website")],
    ["preferences", 10, "Answer two job-preference questions", "preferences", ["authorizedToWork", "desiredSalary", "workPreference", "noticePeriod"].filter(filled).length >= 2],
  ];
  const parts = {};
  let score = 0;
  let best = null;
  for (const [key, weight, label, tab, done] of defs) {
    parts[key] = { weight, done };
    if (done) score += weight;
    else if (!best || weight > best.weight) best = { key, weight, label, tab };
  }
  return { score, parts, nextAction: best ? { key: best.key, label: best.label, href: `/profiles?tab=${best.tab}` } : null };
}

/** Handles /api/profile/items/**, /api/profile/completeness; returns true when answered. */
function handleProfileItems(req, res, path, method) {
  const m = path.match(/^\/api\/profile\/items(?:\/(reorder|import|\d+))?$/);
  if (!m && path !== "/api/profile/completeness") return false;
  if (!subOf(req)) {
    req.resume();
    json(res, 401, { error: "Unauthorized" });
    return true;
  }
  if (path === "/api/profile/completeness" && method === "GET") {
    req.resume();
    json(res, 200, completeness());
    return true;
  }
  const arg = m?.[1];
  if (!arg && method === "GET") {
    req.resume();
    const section = new URL(req.url ?? "/", "http://localhost").searchParams.get("section");
    json(res, 200, ITEMS.filter((i) => !section || i.section === section).sort((a, b) => a.section.localeCompare(b.section) || a.position - b.position));
    return true;
  }
  if (!arg && method === "POST") {
    withBody(req, (b) => {
      const data = b.dataJson ?? b.data;
      if (!b.section || !data || typeof data !== "object" || Array.isArray(data)) return problem(res, 422, "ITEM_INVALID", { path: "dataJson", message: "must be a JSON object" });
      if (JSON.stringify(data).length > 16384) return problem(res, 413, "ITEM_TOO_LARGE", { path: "dataJson", maxBytes: 16384 });
      const hit = findSensitive(data, "dataJson");
      if (hit) return problem(res, 422, "SENSITIVE_CONTENT", { path: hit, class: "SSN_ITIN" });
      const pos = ITEMS.filter((i) => i.section === b.section).length;
      const item = { id: nextItemId++, section: b.section, position: pos, data, provenance: b.provenance ?? "USER", sourceResumeId: null, hidden: false, updatedAt: new Date().toISOString() };
      ITEMS.push(item);
      json(res, 201, item);
    });
    return true;
  }
  if (arg === "reorder" && method === "POST") {
    withBody(req, (b) => {
      (b.ids ?? []).forEach((id, i) => {
        const it = ITEMS.find((x) => x.id === id && x.section === b.section);
        if (it) it.position = i;
      });
      res.writeHead(204);
      res.end();
    });
    return true;
  }
  if (arg && /^\d+$/.test(arg)) {
    const idx = ITEMS.findIndex((i) => i.id === Number(arg));
    if (method === "DELETE") {
      req.resume();
      if (idx < 0) return json(res, 404, { status: 404, title: "Not Found" }), true;
      ITEMS.splice(idx, 1);
      res.writeHead(204);
      res.end();
      return true;
    }
    if (method === "PUT") {
      withBody(req, (b) => {
        if (idx < 0) return json(res, 404, { status: 404, title: "Not Found" });
        const item = ITEMS[idx];
        const data = b.dataJson ?? b.data;
        if (data !== undefined) {
          if (!data || typeof data !== "object" || Array.isArray(data)) return problem(res, 422, "ITEM_INVALID", { path: "dataJson", message: "must be a JSON object" });
          const hit = findSensitive(data, "dataJson");
          if (hit) return problem(res, 422, "SENSITIVE_CONTENT", { path: hit, class: "SSN_ITIN" });
          item.data = data;
        }
        if (typeof b.hidden === "boolean") item.hidden = b.hidden;
        if (b.provenance) item.provenance = b.provenance;
        item.updatedAt = new Date().toISOString();
        json(res, 200, item);
      });
      return true;
    }
  }
  req.resume();
  json(res, 405, { error: "Method not allowed" });
  return true;
}

const server = http.createServer((req, res) => {
  const path = new URL(req.url ?? "/", "http://localhost").pathname;
  const method = req.method ?? "GET";

  if (path === "/api/public/demo") return json(res, 200, DEMO_INFO);

  if (path === "/api/authenticate/demo" && method === "POST") {
    if (!DEMO_ENABLED) {
      req.resume();
      return json(res, 403, { code: "DEMO_DISABLED", message: "Demo accounts are currently disabled" });
    }
    return withBody(req, (b) => {
      const login = String(b.login ?? "");
      return ACCOUNTS[login] ? json(res, 200, pair(login)) : json(res, 400, { error: "Unknown demo account." });
    });
  }
  if (path === "/api/refresh" && method === "POST") {
    return withBody(req, (b) => {
      const sub = String(b.refreshToken ?? "").replace(/^refresh\./, "");
      return ACCOUNTS[sub] ? json(res, 200, pair(sub)) : json(res, 401, { error: "invalid" });
    });
  }
  if (path === "/api/logout") {
    req.resume();
    return json(res, 200, { ok: true });
  }
  // Public "Contact us" submit (anonymous, like the real API): accepted and dropped; nothing is stored.
  if (path === "/api/inquiries" && method === "POST") {
    return withBody(req, (b) =>
      b.name && b.email ? json(res, 201, { ok: true }) : json(res, 400, { detail: "Please add your name and email." }),
    );
  }

  // --- Resume Builder (R0.3 endpoints, in memory; DEV ONLY) -----------------------------------------
  // Unlike every other write in this mock, these succeed, so the editor can be tried without the API.
  // ETag / If-Match / 409 / 422 / 402 behave like ResumeDocResource. To force a 409 from outside:
  //   curl -X POST http://localhost:<MOCK_API_PORT>/mock/resumes/<id>/edit-elsewhere   (bumps the server copy)
  if (handleBuilder(req, res, path, method)) return;
  if (handleProfileItems(req, res, path, method)) return;

  req.resume(); // other bodies are ignored
  const sub = subOf(req);
  if (!sub) return json(res, 401, { error: "Unauthorized" });

  // The demo switch is server config only: no endpoint flips it (reset is a POST below, refused like any write).
  if (path === "/api/admin/settings/demo" && method !== "GET" && method !== "HEAD") {
    return json(res, 405, { error: "Method not allowed: the demo switch is controlled by server config (DEMO_ENABLED)." });
  }

  // The real API refuses writes from a demo session. (Reads below.)
  if (method !== "GET" && method !== "HEAD") {
    return json(res, 403, { code: "DEMO_READ_ONLY", message: "This is a demo account - changes aren't saved" });
  }

  // Platform-admin sample data (demo-admin only, GET only; writes are refused above).
  if (path.startsWith("/api/admin/") || path.startsWith("/management/")) {
    if (!ACCOUNTS[sub].authorities.includes("ROLE_ADMIN")) return json(res, 403, { error: "Forbidden" });
    if (path === "/api/admin/analytics")
      return json(res, 200, {
        totalUsers: 1284, activatedUsers: 912, activationRatePct: 71, signups7d: 96, signups30d: 340,
        activeUsers7d: 412, activeUsers30d: 780, totalResumes: 1650, totalApplications: 5420,
        funnel: { signedUp: 1284, activated: 912, withProfile: 700, startedApplying: 520, applied: 430 },
        applicationsByStatus: { SAVED: 900, DRAFT: 300, APPLIED: 3100, INTERVIEW: 700, OFFER: 120, REJECTED: 300 },
        billing: { activePro: 64, monthlyCount: 40, threeMonthCount: 24, mrr: 1400, newThisMonth: 11, churnedThisMonth: 2, pastDue: 1 },
        fillQuality: [{ ats: "greenhouse", fills: 320, fillRatePct: 92, gapRatePct: 6, correctionRatePct: 4, genericPct: 3, fieldsFailed: 12 }],
      });
    if (path === "/api/admin/users") {
      const users = Object.values(ACCOUNTS).map((a, i) => ({
        id: i + 1, login: a.login, email: a.email, firstName: a.firstName, lastName: a.lastName,
        activated: true, authorities: a.authorities, createdDate: ago(30 - i), lastModifiedDate: ago(i),
      }));
      res.writeHead(200, { "content-type": "application/json", "x-total-count": String(users.length) });
      return res.end(JSON.stringify(users));
    }
    if (path === "/api/admin/settings/demo")
      return json(res, 200, { enabled: DEMO_ENABLED, accounts: DEMO_ACCOUNTS });
    if (path === "/api/admin/audit") {
      const events = [
        ["admin", "DEMO_RESET", "DEMO", "demo.data", 2],
        ["admin", "USER_ACTIVATED", "user", "priya.s", 4],
        ["admin", "AI_QUOTA_OVERRIDE", "user", "ravi.k", 6],
      ].map(([actor, action, targetType, targetId, d], i) => ({
        id: i + 1, actor, action, targetType, targetId, reason: null, createdDate: ago(d),
      }));
      res.writeHead(200, { "content-type": "application/json", "x-total-count": String(events.length) });
      return res.end(JSON.stringify(events));
    }
    // --- admin3b: customers (Customers board) ---
    if (path === "/api/admin/customers/counts") return json(res, 200, { ALL: 5, ACTIVE: 3, PAST_DUE: 1, CANCELLING: 1, LAPSED: 0, NEW: 2 });
    if (path === "/api/admin/customers") {
      const mk = (login, name, g, b, endIn, paid, since) => ({ login, name, email: login + "@example.com", statusGroup: g, stripeStatus: g.toLowerCase(), billing: b,
        currentPeriodEnd: ago(-endIn), cancelAtPeriodEnd: g === "CANCELLING", totalPaidCents: paid, currency: "usd", since: ago(since), stripeUrl: "https://dashboard.stripe.com/customers/cus_" + login });
      const cs = [mk("priya.s", "Priya S", "ACTIVE", "MONTHLY", 3, 5997, 5), mk("ravi.k", "Ravi K", "ACTIVE", "QUARTERLY", 40, 4999, 60),
        mk("mei.l", "Mei L", "ACTIVE", "MONTHLY", 1, 1999, 12), mk("tom.b", "Tom B", "PAST_DUE", "MONTHLY", 2, 3998, 90), mk("ana.c", "Ana C", "CANCELLING", "MONTHLY", 5, 7996, 150)];
      res.writeHead(200, { "content-type": "application/json", "x-total-count": String(cs.length) });
      return res.end(JSON.stringify(cs));
    }
    // --- end admin3b: customers ---
    // --- BEGIN admin3b mock (Email / Bug reports / Inquiries) ---
    {
      const q = new URL(req.url ?? "/", "http://localhost").searchParams;
      const paged = (all, statusKey = "status") => {
        const st = q.get("status");
        const list = st ? all.filter((r) => r[statusKey] === st) : all;
        const size = Number(q.get("size") ?? 30), pg = Number(q.get("page") ?? 0);
        res.writeHead(200, { "content-type": "application/json", "x-total-count": String(list.length) });
        return res.end(JSON.stringify(list.slice(pg * size, pg * size + size)));
      };
      const tally = (all) => json(res, 200, all.reduce((m, r) => ((m[r.status] = (m[r.status] ?? 0) + 1), m), {}));
      const SUBS = Array.from({ length: 41 }, (_, i) => ({
        id: i + 1, email: `subscriber${i + 1}@example.com`, status: ["CONFIRMED", "CONFIRMED", "PENDING", "UNSUBSCRIBED"][i % 4],
        consentSource: ["footer", "blog", "pricing"][i % 3], consentAt: ago(i), confirmedAt: ago(i), createdDate: ago(i),
      }));
      const MSGS = ["Job application fails with 500 error", "Resume parsing missing skills", "Email notifications not sent", "Filters not working on job search", "UI overlap on smaller screens", "CSV export missing columns"];
      const BUGS = MSGS.map((m, i) => ({
        id: 1000 + i, source: i % 2 ? "extension" : "web", userLogin: i % 3 ? `user${i}` : null, email: `u${i}@example.com`,
        message: m, category: ["BUG", "FEEDBACK", "BUG"][i % 3], severity: [null, "HIGH", "MEDIUM", "LOW"][i % 4],
        status: ["NEW", "TRIAGED", "IN_PROGRESS", "RESOLVED", "WONTFIX", "NEW"][i], createdDate: ago(i),
      }));
      const INQS = ["autopilot", "organization", "resume-review", "coaching", "other"].map((t, i) => ({
        id: 2000 + i, topic: t, name: ["Jason Diaz", "Sarah Lee", "Michael Kim", "Emma Park", "David Tan"][i],
        email: `person${i}@example.com`, company: i % 2 ? "Acme Staffing" : null, teamSize: i % 2 ? "10-50" : null,
        message: "Hi, we would like to learn more about your offering.", userLogin: null,
        status: ["NEW", "CONTACTED", "NEW", "WON", "LOST"][i], adminNotes: i === 1 ? "Call booked Tue" : null, createdDate: ago(i),
      }));
      if (path === "/api/admin/subscribers") return paged(SUBS);
      if (path === "/api/admin/subscribers/counts") return tally(SUBS);
      if (path === "/api/admin/bug-reports") return paged(BUGS);
      if (path === "/api/admin/bug-reports/counts") return tally(BUGS);
      if (path.startsWith("/api/admin/bug-reports/")) {
        const b = BUGS.find((r) => String(r.id) === path.split("/").pop());
        return b ? json(res, 200, { ...b, url: "https://kiwiply.com/jobs", appVersion: "1.0.0", userAgent: "Mozilla/5.0", adminNotes: null }) : json(res, 404, {});
      }
      if (path === "/api/admin/inquiries") return paged(INQS);
      if (path === "/api/admin/inquiries/counts") return tally(INQS);
    }
    // --- END admin3b mock ---
    // --- admin3b (System page): actuator sample ---
    // --- admin3b (ai / job-sources) mock endpoints: begin ---
    if (path === "/api/admin/ai-usage")
      return json(res, 200, {
        period: new Date().toISOString().slice(0, 7), proBudgetMicros: 3_000_000, freeParsesPerMonth: 3,
        totalCostMicros: 287_420_000, totalCalls: 48329, userCount: 214,
        users: [
          { login: "sophie.lee", calls: 1428, costMicros: 2_800_000, percentOfProBudget: 93 },
          { login: "daniel.kim", calls: 972, costMicros: 2_100_000, percentOfProBudget: 70 },
          { login: "ava.patel", calls: 864, costMicros: 1_200_000, percentOfProBudget: 40 },
          { login: null, calls: 120, costMicros: 300_000, percentOfProBudget: 10 },
        ],
        tasks: [
          { task: "draft", calls: 18623, costMicros: 120_000_000 }, { task: "match", calls: 11572, costMicros: 70_000_000 },
          { task: "fit", calls: 7421, costMicros: 45_000_000 }, { task: "tailor", calls: 5684, costMicros: 34_000_000 },
          { task: "parse", calls: 5029, costMicros: 18_000_000 },
        ],
      });
    if (path === "/api/admin/job-sources") {
      const mk = (id, ats, token, name, origin, enabled, status, n, stored, err, fails) => ({
        id, ats, boardToken: token, companyName: name, origin, enabled, lastFetchedAt: ago(id % 3), lastStatus: status,
        lastError: err ?? null, lastJobCount: n, consecutiveFailures: fails ?? 0, storedPostings: stored,
      });
      return json(res, 200, {
        nightlyEnabled: true, running: false, matching: false, freshPostings: 842,
        lastRun: { startedAt: ago(0), durationMs: 184000, boardsRead: 12, boardsFailed: 2, boardsSwitchedOff: 0, seedsAdded: 0, discovered: 3, postingsAdded: 310, duplicatesSkipped: 44, postingsDeleted: 20 },
        lastMatchRun: { startedAt: ago(0), durationMs: 41000, users: 90, matched: 70, noCandidates: 15, skipped: 4, errors: 1, shown: 410 },
        sources: [
          mk(1, "greenhouse", "stripe", "Stripe", "SEED", true, "OK", 342, 120), mk(2, "lever", "netflix", "Netflix", "SEED", true, "OK", 287, 98),
          mk(3, "greenhouse", "acme", "Acme Careers", "ADMIN", true, "FAILED", 0, 0, "Authentication failed. Token expired.", 3),
          mk(4, "ashby", "notion", "Notion", "DISCOVERED", true, "OK", 98, 40), mk(5, "lever", "globex", "Globex", "ADMIN", false, "OK", 93, 22),
          mk(6, "greenhouse", "airbnb", "Airbnb", "SEED", true, "OK", 201, 77), mk(7, "ashby", "linear", "Linear", "SEED", true, "FAILED", 0, 3, "Rate limit exceeded.", 1),
          mk(8, "lever", "spotify", "Spotify", "SEED", true, "OK", 64, 30), mk(9, "greenhouse", "databricks", "Databricks", "SEED", true, "OK", 156, 61),
          mk(10, "lever", "figma", "Figma", "DISCOVERED", true, "OK", 41, 15),
        ],
      });
    }
    // --- admin3b: end ---
    if (path === "/management/health")
      return json(res, 200, { status: "UP", components: { db: { status: "UP" }, diskSpace: { status: "UP" }, mail: { status: "UP" }, ping: { status: "UP" } } });
    if (path === "/management/info") return json(res, 200, { build: { version: "0.9.0-demo", name: "dossier-api" }, activeProfiles: ["dev", "demo"] });
    if (path === "/management/jhimetrics")
      return json(res, 200, { processMetrics: { "process.uptime": 1234567, "system.cpu.count": 4 }, jvm: { heap: { used: 412 * 1048576, max: 1024 * 1048576, committed: 600 * 1048576 } } });
    if (path === "/management/loggers")
      return json(res, 200, { loggers: { ROOT: { effectiveLevel: "INFO" }, "com.dossier.api": { effectiveLevel: "DEBUG" }, "org.springframework": { effectiveLevel: "WARN" } } });
    // --- end admin3b ---
    return json(res, 404, { error: `mock-api: no admin handler for ${path}` });
  }

  if (path === "/api/account") return json(res, 200, ACCOUNTS[sub]);
  if (path === "/api/billing/me")
    return json(res, 200, {
      plan: "FREE",
      status: "none",
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      billingEnabled: true,
      hasCustomer: false,
    });
  if (path === "/api/ai/usage")
    return json(res, 200, { metered: "count", used: 1, limit: 3, resetsAt: ago(-20), economy: false });
  if (path === "/api/profile") return json(res, 200, { payload: JSON.stringify(BIO) });
  if (path === "/api/profile/applications") return json(res, 200, APPLICATIONS);
  if (path === "/api/profile/resumes")
    return json(
      res,
      200,
      RESUMES.map((r) => {
        const d = DOCS.get(r.id);
        return d ? { ...r, contentHash: `mock-${d.version}`, exportedHash: d.exportedHash ?? null, exportedAt: d.exportedAt ?? null } : r;
      }),
    );
  if (path === "/api/profile/suggestions") return json(res, 200, []);
  if (path === "/api/profile/notifications") return json(res, 200, { unread: 0, items: [] });
  if (path === "/api/profile/job-matches/settings") return json(res, 200, { enabled: false });
  if (path === "/api/profile/job-matches") return json(res, 402, { code: "PRO_REQUIRED" }); // Free: samples render
  if (path === "/api/profile/inbox") return json(res, 404, {});

  return json(res, 404, { error: `mock-api: no handler for ${method} ${path}` });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`mock-api (demo accounts, no database) listening on http://localhost:${PORT}`);
});

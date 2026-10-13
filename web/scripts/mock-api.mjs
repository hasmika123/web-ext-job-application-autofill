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
import { createTrackerMock } from "./mock-tracker.mjs";
import { createJobsMock } from "./mock-jobs.mjs";
import { MOCK_TENANTS, MOCK_TENANT_PASSWORD, MOCK_TENANT_USERS, mockTenantAsset } from "./mock-tenants.mjs";
import { createBrandingMock } from "./mock-branding.mjs";
import { readFileSync } from "node:fs";
import { aiCallsFixture, aiConfigFixture, aiHistoryFixture } from "./fixtures/admin-ai.mjs";

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

// MOCK_FIXTURE=<name> (U19.3): `scripts/fixtures/<name>.mjs` adds accounts (non-demo logins with a test password) and may
// mark them `empty: true` (every per-user list comes back empty). Unset = the demo accounts only, as before.
const FIXTURE_NAME = process.env.MOCK_FIXTURE ?? "";
if (FIXTURE_NAME && !/^[a-z0-9-]+$/.test(FIXTURE_NAME)) {
  console.error(`mock-api: bad MOCK_FIXTURE "${FIXTURE_NAME}"`);
  process.exit(1);
}
const FIXTURE = FIXTURE_NAME ? (await import(`./fixtures/${FIXTURE_NAME}.mjs`)).default : null;
/** login -> { ...account, password, empty } for the fixture's non-demo accounts. */
const FIXTURE_ACCOUNTS = FIXTURE?.accounts ?? {};
for (const a of Object.values(FIXTURE_ACCOUNTS))
  ACCOUNTS[a.login] = { login: a.login, email: a.email, firstName: a.firstName, lastName: a.lastName, authorities: a.authorities, activated: a.activated };
const isEmptyAccount = (sub) => !!sub && !!FIXTURE_ACCOUNTS[sub]?.empty;
/** An empty account's own bio (R1.12): the setup flow writes it, so the demo accounts' shared bio is never touched. */
const EMPTY_BIOS = new Map();

// Mirrors the real API's DEMO_ENABLED config flag: MOCK_DEMO_ENABLED=false turns the demo off (default on).
// X1.4: the enterprise master flag (public config `enterprise`) and the tenant hosts the mock serves.
const ENTERPRISE_ENABLED = !/^(false|0|no|off)$/i.test(process.env.MOCK_ENTERPRISE_ENABLED ?? "true");
const PLATFORM_MOCK_HOSTS = new Set(["", "localhost", "127.0.0.1", "[::1]"]);
/** Last X-Kiwiply-Host seen per API path, readable at GET /__mock/seen-hosts (web route tests assert the BFF forwards it). */
const seenHosts = new Map();
// Mirrors the real API's DEMO_ENABLED config flag: MOCK_DEMO_ENABLED=false turns the demo off (default on).
const DEMO_ENABLED = !/^(false|0|no|off)$/i.test(process.env.MOCK_DEMO_ENABLED ?? "true");
// Mirrors the real API org feature flag (ORGS_ENABLED): on in the mock by default, MOCK_ORGS_ENABLED=false turns it off.
const ORGS_ENABLED = !/^(false|0|no|off)$/i.test(process.env.MOCK_ORGS_ENABLED ?? "true");

// The demo organization (fixtures/demo-org.json is the same table the API seeds; DemoOrgSeederIT diffs it against the seed).
const DEMO_ORG = JSON.parse(readFileSync(new URL("./fixtures/demo-org.json", import.meta.url), "utf8"));
const ORG_OWNER_PERMISSIONS = ["org.settings.manage", "org.close", "org.transfer_ownership", "members.invite", "members.import", "members.role.set", "members.remove", "members.suspend", "members.support_owner.set", "groups.manage", "assignments.manage", "billing.view", "billing.manage", "reports.view", "reports.export", "member.view_summary", "services.order_for_member", "audit.view", "integrations.manage", "ops.*", "self.share_scope.set", "self.leave"];
const ORG_MEMBER_PERMISSIONS = ["ops.own_hours", "self.share_scope.set", "self.leave"];
/** Active seats: the owner, the people with ACTIVE status, and the demo job seeker. */
const demoOrgSeats = () => 1 + DEMO_ORG.people.filter((p) => p.status === "ACTIVE").length + 1;
const demoOrgRole = (sub) => (sub === DEMO_ORG.owner ? "OWNER" : sub === DEMO_ORG.jobSeeker.login ? "MEMBER" : null);
const demoOrgNotFound = (res) => json(res, 404, { status: 404, code: "NOT_FOUND", title: "Not Found", message: "error.org" });

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
const token = (sub, ttlSec, extra = {}) =>
  `${b64({ alg: "none", typ: "JWT" })}.${b64({ sub, exp: Math.floor(Date.now() / 1000) + ttlSec, ...extra })}.mock`;
const pair = (sub) => ({ accessToken: token(sub, 15 * 60), refreshToken: `refresh.${sub}` });
/** X2.6: a tenant sign-in mints a tid-bound pair (tid = the org key of the host). MOCK_ACCESS_TTL_SEC shortens the access token so the proxy refresh can be seen. */
const tenantPair = (sub, orgKey) => ({
  accessToken: token(sub, Number(process.env.MOCK_TENANT_ACCESS_TTL_SEC ?? 15 * 60), { tid: orgKey }),
  refreshToken: `refresh.t.${orgKey}.${sub}`,
});
const hostOf = (req) => {
  const raw = req.headers["x-kiwiply-host"];
  return (typeof raw === "string" ? raw : "").split(",")[0].trim().toLowerCase().replace(/:\d+$/, "");
};
/** The org key a tenant host serves (acme.localhost -> acme); null for any other host. */
const orgKeyOf = (host) => (MOCK_TENANTS[host] ? host.split(".")[0] : null);
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
  headline: "Product Designer",
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

/* ── Organization branding mock (X2.18: draft/publish/versions/assets for the acme owner; scripts/mock-branding.mjs) ── */
const bearerSub = (req) => {
  try {
    return JSON.parse(Buffer.from((req.headers.authorization ?? "").replace(/^Bearer\s+/i, "").split(".")[1] ?? "", "base64url").toString()).sub ?? null;
  } catch {
    return null;
  }
};
const handleBranding = createBrandingMock({
  json,
  subOf: bearerSub,
  // a publish changes what the public tenant view says for acme.localhost (the real API's public view reads published values only)
  onPublish: (p) => {
    const t = MOCK_TENANTS["acme.localhost"];
    if (t) t.branding = { ...t.branding, primary: p.primary ?? null, secondary: p.secondary ?? null, theme: p.theme ?? "LIGHT", welcomeTitle: p.welcomeTitle ?? null, welcomeMessage: p.welcomeMessage ?? null, supportEmail: p.supportEmail ?? null, featureChips: p.featureChips ?? null, logoUrl: p.logoHash ? `/tenant-assets/logo?v=${p.logoHash}` : null };
  },
});
/* ── Applications tracker mock (APP-E2E U6.2/U6.4: list v2, detail, patch, notes, bulk, interviews, .ics; scripts/mock-tracker.mjs) ── */
const handleTracker = createTrackerMock({ APPLICATIONS, json, withBody, subOf, ago, findSensitive, isEmpty: (req) => isEmptyAccount(subOf(req)) });
/* ── Job search mock (APP-E2E U4.0: search, suggest, detail, save, hide; scripts/mock-jobs.mjs) ── */
const handleJobs = createJobsMock({ json, withBody, subOf, APPLICATIONS, recordEvent: handleTracker.record, isEmptyAccount });

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

/** A resume with every section kind, for trying the editor's canvas (R2.1): resume 3. */
const seedFullDoc = (title) => {
  const doc = seedDoc(title);
  doc.basics.phone = "(650) 123-4567";
  doc.basics.links = [
    { label: "LinkedIn", url: "linkedin.com/in/priyasharma" },
    { label: "Website", url: "priyasharma.dev" },
    { label: "GitHub", url: "github.com/priyasharma" },
  ];
  const sections = doc.sections;
  sections[1].items.push({
    id: docId("i"), title: "Product Designer", org: "Contoso", location: "Austin, TX", start: "2018-06", end: "2021-02",
    bullets: [
      { id: docId("b"), text: "Launched 2 AI-driven features used by 10M+ people worldwide.", src: "parsed" },
      { id: docId("b"), text: "Drove a 25% increase in engagement through product experiments.", src: "parsed" },
    ],
  });
  sections[2].items[0].gpa = "3.8/4.0";
  sections.push(
    { id: "s_projects", kind: "PROJECTS", title: "Projects", items: [{ id: docId("i"), title: "Open-source icon set", url: "github.com/priyasharma/icons", start: "2022", end: "2023", bullets: [{ id: docId("b"), text: "1.2k stars, used by 30 teams.", src: "user" }] }] },
    { id: "s_certs", kind: "CERTIFICATIONS", title: "Certifications", items: [{ id: docId("i"), title: "Google UX Design", org: "Google", date: "2020-05", url: "" }] },
    { id: "s_langs", kind: "LANGUAGES", title: "Languages", items: [{ id: docId("i"), name: "English", level: "Fluent" }, { id: docId("i"), name: "Hindi", level: "Native" }] },
    { id: "s_ach", kind: "ACHIEVEMENTS", title: "Achievements", items: [{ id: docId("i"), text: "Design Excellence award, 2023", date: "2023-11" }] },
    { id: "s_int", kind: "INTERESTS", title: "Interests", items: [{ id: docId("i"), text: "Typography" }, { id: docId("i"), text: "Trail running" }] },
    { id: "s_custom", kind: "CUSTOM", title: "Volunteering", items: [{ id: docId("i"), title: "Mentor", org: "ADPList", start: "2021", end: null, current: true, bullets: [{ id: docId("b"), text: "Mentored 40 early-career designers.", src: "user" }] }] },
  );
  return doc;
};

DOCS.set(3, { doc: seedFullDoc("Product Manager"), templateId: "modern", theme: null, version: 2, updatedAt: ago(3) });
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
    score: d.score ? { score: d.score.score, rulesetVersion: d.score.rulesetVersion } : null,
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
    /^\/api\/profile\/resumes\/\d+\/(doc(\/template|\/theme|\/text)?|export-recorded)$/.test(path) ||
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
      // A resume made from an upload keeps the first file apart from its generated PDF (ResumeFileResource#upload).
      if ((d.sourceKind === "UPLOAD" || d.sourceKind === "IMPORT") && !d.originalBytes) {
        d.originalBytes = bytes;
        d.doc.meta.originalFileKey = `resume-originals/mock/${id}`;
        d.version += 1;
        res.writeHead(200);
        return res.end();
      }
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

  if (method === "GET" && path.endsWith("/doc/text")) {
    req.resume();
    res.writeHead(200, { "content-type": "text/plain;charset=UTF-8" });
    res.end(docText(d.doc));
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
      // R2.5: the BFF computes the Resume Score and Spring stores it as sent (the mock keeps the last one).
      if (b.score && typeof b.score === "object" && b.score.rulesetVersion === "v1") d.score = b.score;
      d.version += 1;
      d.updatedAt = new Date().toISOString();
      const r = RESUMES.find((x) => x.id === id);
      // The name is the resume's (R3.9): the document only mirrors it, whatever the client sent.
      if (r) d.doc.meta.title = r.label;
      recordAutosave(id);
      withEtag(res, 200, docDto(id), d.version);
    });
    return true;
  }

  if (method === "PATCH" && path.endsWith("/doc/template")) {
    withBody(req, (b) => {
      if (b.templateId !== "modern") return problem(res, 422, "DOC_INVALID", { path: "$.templateId", message: "unknown template" });
      d.templateId = b.templateId;
      if (b.theme && typeof b.theme === "object") d.theme = b.theme; // R3.4: an undo / redo restores the exact theme (the real API applies template defaults otherwise)
      d.version += 1;
      d.updatedAt = new Date().toISOString();
      withEtag(res, 200, docDto(id), d.version);
    });
    return true;
  }

  // Customize Template (R2.4): bounded fields only, derived numbers dropped; no If-Match, bumps the version.
  if (method === "PATCH" && path.endsWith("/doc/theme")) {
    withBody(req, (b) => {
      const t = b.theme;
      const bad = (p, message) => problem(res, 422, "THEME_INVALID", { path: p, message });
      if (!t || typeof t !== "object" || Array.isArray(t)) return bad("$.theme", "must be an object");
      const oneOf = (k, allowed) => t[k] == null || allowed.includes(t[k]);
      if (t.accent != null && !(typeof t.accent === "string" && /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(t.accent))) return bad("$.theme.accent", "must be a #rgb or #rrggbb colour");
      if (!oneOf("fontPair", ["inter", "source-serif", "georgia-arial"])) return bad("$.theme.fontPair", "unknown font pair");
      if (!oneOf("spacing", ["compact", "normal", "spacious"])) return bad("$.theme.spacing", "unknown spacing");
      if (t.fit != null && (typeof t.fit !== "object" || ![undefined, null, 1, 2].includes(t.fit.target))) return bad("$.theme.fit.target", "must be 1 or 2");
      const stored = { ...t };
      for (const derived of ["size", "density", "margin"]) delete stored[derived];
      d.theme = stored;
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

/* ── Resume access mock (R3.11 contract; in memory) ───────────────────────────────────────────────
 * Links on the built resumes, the public page behind them, and an empty "shared with me". A refused
 * link (unknown, revoked) is the same 404 as the real API's. Dev only, like the builder above. */
const LINKS = []; // { id, resumeId, token, label, allowDownload, revokedAt, viewCount }
let nextLinkId = 1;
const newToken = () => {
  const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  let t = "";
  for (let i = 0; i < 32; i++) t += chars[Math.floor(Math.random() * chars.length)];
  return t;
};
const linkDto = (l, base) => ({
  id: l.id, subjectType: "LINK", role: "VIEW", label: l.label ?? undefined, allowDownload: l.allowDownload, expired: false,
  expiresAt: l.expiresAt ?? null, createdAt: l.createdAt, viewCount: l.viewCount, url: `${base}/r/${l.token}`,
});
const LINK_DAYS = 30; // resume.share.linkDefaultDays
const addLink = (resumeId, b = {}) => {
  const l = { id: nextLinkId++, resumeId, token: newToken(), label: b.label || null, allowDownload: b.allowDownload === true, revokedAt: null, viewCount: 0, createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + LINK_DAYS * DAY).toISOString() };
  LINKS.push(l);
  return l;
};
const MAX_LINKS = 3; // resume.share.maxLinks

function handleAccess(req, res, path, method) {
  const pub = path.match(/^\/api\/public\/resumes\/([^/]+)(\/pdf)?$/);
  if (pub && method === "GET") {
    req.resume();
    const link = LINKS.find((l) => l.token === pub[1] && !l.revokedAt);
    const d = link && DOCS.get(link.resumeId);
    if (!link || !d) return json(res, 404, { status: 404, title: "Not Found" }), true;
    if (pub[2]) return (link.allowDownload ? json(res, 409, { status: 409, code: "PDF_NOT_READY" }) : json(res, 404, { status: 404, title: "Not Found" })), true;
    link.viewCount += 1;
    const r = RESUMES.find((x) => x.id === link.resumeId);
    res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store", "x-robots-tag": "noindex, nofollow" });
    res.end(JSON.stringify({ name: r?.label ?? "Resume", doc: d.doc, templateId: d.templateId, theme: d.theme, allowDownload: link.allowDownload, pdfReady: false }));
    return true;
  }
  if (path === "/api/profile/resumes/shared-with-me" && method === "GET") {
    req.resume();
    if (!subOf(req)) return json(res, 401, { error: "Unauthorized" }), true;
    return json(res, 200, []), true;
  }
  const m = path.match(/^\/api\/profile\/resumes\/(\d+)\/access(?:\/(link|\d+))?$/);
  if (!m) return false;
  if (!subOf(req)) {
    req.resume();
    return json(res, 401, { error: "Unauthorized" }), true;
  }
  const resumeId = Number(m[1]);
  const webBase = process.env.MOCK_WEB_URL ?? "http://localhost:3000";
  if (!DOCS.has(resumeId)) {
    req.resume();
    return json(res, 404, { status: 404, title: "Not Found" }), true;
  }
  if (m[2] === "link" && method === "POST") {
    withBody(req, (b) => {
      if (LINKS.filter((x) => x.resumeId === resumeId && !x.revokedAt).length >= MAX_LINKS) {
        return json(res, 422, { status: 422, code: "LIMIT", title: `A resume can have at most ${MAX_LINKS} active links` });
      }
      json(res, 201, linkDto(addLink(resumeId, b), webBase));
    });
    return true;
  }
  if (m[2] && /^\d+$/.test(m[2]) && method === "PATCH") {
    withBody(req, (b) => {
      const l = LINKS.find((x) => x.id === Number(m[2]) && x.resumeId === resumeId && !x.revokedAt);
      if (!l) return json(res, 404, { status: 404, title: "Not Found" });
      if (typeof b.allowDownload !== "boolean") return json(res, 422, { status: 422, code: "ACCESS_INVALID", title: "allowDownload must be true or false" });
      l.allowDownload = b.allowDownload;
      json(res, 200, linkDto(l, webBase));
    });
    return true;
  }
  if (m[2] && /^\d+$/.test(m[2]) && method === "DELETE") {
    req.resume();
    const l = LINKS.find((x) => x.id === Number(m[2]) && x.resumeId === resumeId);
    if (!l) return json(res, 404, { status: 404, title: "Not Found" }), true;
    l.revokedAt ??= new Date().toISOString();
    res.writeHead(204);
    res.end();
    return true;
  }
  if (!m[2] && method === "GET") {
    req.resume();
    const links = LINKS.filter((l) => l.resumeId === resumeId && !l.revokedAt).map((l) => linkDto(l, webBase));
    return json(res, 200, { org: null, grants: [], links, viewers: links.reduce((n, l) => n + l.viewCount, 0) }), true;
  }
  req.resume();
  json(res, 405, { error: "Method not allowed" });
  return true;
}

/* ── Resume Builder AI mock (R4.1 contract, R4.2 UI; deterministic fakes, in memory) ──────────────────────────
 * Rewrite / summary proposals with no model: the same answer for the same input, so screenshots repeat.
 * Switches (no auth, DEV ONLY), e.g. `curl "http://127.0.0.1:<MOCK_API_PORT>/__mock/ai?plan=pro&mode=quota"`:
 *   plan = free | pro     (the web reads it when a page renders: reload after changing it)
 *   mode = ok (default) | quota | daily | fail | nothing | disabled | slow
 * Proposals go stale when the document version moves, like the real content-hash check. */
let PRO = process.env.MOCK_PRO === "1" || Number(process.env.MOCK_RESUME_LIMIT ?? FREE_RESUME_LIMIT) > FREE_RESUME_LIMIT;
let AI_MODE = process.env.MOCK_AI_MODE ?? "ok";
const AI_PROPOSALS = new Map(); // id -> { id, resumeId, task, mode, version, status, changes }
let nextProposalId = 500;
let aiUsed = 12;
const aiUsage = (extra = {}) => ({ used: aiUsed, limit: 100, resetsAt: new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 1)).toISOString(), economy: false, ...extra });

const VERBS = { led: "Spearheaded", built: "Engineered", launched: "Shipped", drove: "Spearheaded", mentored: "Coached", owned: "Took charge of", cut: "Reduced", improved: "Raised", managed: "Directed" };
const FORMAL = { led: "Directed", built: "Developed", launched: "Introduced", drove: "Advanced", mentored: "Advised", cut: "Reduced", improved: "Enhanced" };
const PLAIN = { led: "Ran", built: "Made", launched: "Started", drove: "Pushed", mentored: "Helped", cut: "Lowered", improved: "Raised" };
const swapVerb = (text, table) => {
  const m = text.match(/^([A-Za-z]+)(\b.*)$/s);
  const next = m && table[m[1].toLowerCase()];
  return next ? next + m[2] : null;
};
const lowerFirst = (s) => s.charAt(0).toLowerCase() + s.slice(1);
const noDot = (s) => s.replace(/\s+$/, "").replace(/\.$/, "");

/** Up to three alternatives for one line in a mode (empty = nothing sensible to change). */
function mockAlternatives(text, mode) {
  const t = noDot(text.trim());
  const dot = text.trim().endsWith(".") ? "." : "";
  const hasNumber = /\d/.test(t);
  if (mode === "stronger") {
    const a = swapVerb(t, VERBS) ?? `Delivered ${lowerFirst(t)}`;
    const out = [a + dot, `${a}, end to end${dot}`];
    if (!hasNumber) out.push(`${a} by [add a number]${dot}`);
    return out;
  }
  if (mode === "shorter") {
    const words = t.split(/\s+/);
    if (words.length < 4) return [];
    return [words.slice(0, Math.max(3, Math.ceil(words.length * 0.6))).join(" ").replace(/[,;:]$/, "") + dot];
  }
  if (mode === "formal") {
    const a = swapVerb(t, FORMAL);
    return a ? [a + dot] : [];
  }
  if (mode === "plain") {
    const a = swapVerb(t, PLAIN);
    return a ? [a + dot] : [];
  }
  // grammar: capital letter, one space between words, a closing full stop
  const fixed = t.replace(/\s+/g, " ").replace(/^./, (c) => c.toUpperCase()) + ".";
  return fixed === text.trim() ? [] : [fixed];
}

/** Every rewritable line of a doc by ref: bullets, the summary item and achievements. */
function aiLines(doc) {
  const lines = new Map();
  for (const s of doc.sections) {
    if (s.hidden) continue;
    for (const it of s.items ?? []) {
      if (it.hidden) continue;
      const label = s.kind === "SUMMARY" ? "Summary" : [it.title, it.org].filter(Boolean).join(" · ") || s.title || s.kind;
      if (s.kind === "SUMMARY" || s.kind === "ACHIEVEMENTS") {
        if (typeof it.text === "string" && it.text.trim()) lines.set(it.id, { node: it, text: it.text, section: label, formatted: (it.marks ?? []).length > 0 });
      }
      for (const b of it.bullets ?? []) if (typeof b.text === "string" && b.text.trim()) lines.set(b.id, { node: b, text: b.text, section: label, formatted: (b.marks ?? []).length > 0 });
    }
  }
  return lines;
}

const proposalView = (p, d) => ({
  id: p.id, task: p.task, mode: p.mode ?? undefined, stale: p.version !== d.version, createdAt: p.createdAt, changes: p.changes, suggestions: [], model: "mock-flash-lite", aiCallId: p.id + 4000,
  ...(p.kind ? { kind: p.kind, title: p.title, body: p.body } : {}),
});

/* AI Suggestions mock (R4.6): up to four deterministic cards per document version, in carousel order (summary, bullets,
 * keywords, section), each with its own lines so applying one leaves the others usable (the server re-pins them). */
const KIND_RANK = { summary: 0, bullets: 1, keywords: 2, skills: 3, section: 4 };
const openCards = (resumeId) => [...AI_PROPOSALS.values()].filter((p) => p.resumeId === resumeId && p.task === "suggest" && p.status === "OPEN").sort((a, b) => KIND_RANK[a.kind] - KIND_RANK[b.kind] || a.id - b.id);
function mockCards(doc) {
  const lines = aiLines(doc);
  const cards = [];
  const used = new Set();
  const change = (ref, mode, after) => {
    const line = lines.get(ref);
    const alts = after ? [after] : mockAlternatives(line.text, mode).filter((a) => !a.includes("[add a number]"));
    if (!line || used.has(ref) || alts.length === 0) return null;
    used.add(ref);
    return { ref, section: line.section, before: line.text, after: alts[0], reason: { stronger: "Opens with a strong verb and keeps your facts", plain: "Simpler words, same meaning", formal: "A more professional tone" }[mode] ?? "Drafted from what your resume already says", sources: [ref], formatted: line.formatted };
  };
  const sum = doc.sections.find((s) => s.kind === "SUMMARY")?.items?.[0];
  if (sum?.text?.trim()) {
    const c = change(sum.id, "stronger", `${noDot(sum.text.trim())}, shipping design systems used by teams.`);
    if (c) cards.push({ kind: "summary", title: "Make your summary stronger", body: "Add more impact with specific skills, achievements and your unique value.", changes: [c] });
  }
  const bulletRefs = [];
  for (const s of doc.sections) for (const it of s.hidden ? [] : s.items ?? []) for (const b of it.hidden ? [] : it.bullets ?? []) if (lines.has(b.id)) bulletRefs.push(b.id);
  const first = bulletRefs.slice(0, 2).map((r) => change(r, "stronger")).filter(Boolean);
  if (first.length) cards.push({ kind: "bullets", title: "Lead your bullets with a strong verb", body: "Start each bullet with what you did, so the result reads first.", changes: first });
  const kw = bulletRefs.slice(2, 3).map((r) => change(r, "plain")).filter(Boolean);
  if (kw.length) cards.push({ kind: "keywords", title: "Use plainer words recruiters search for", body: "Everyday wording matches more of the terms in job posts.", changes: kw });
  const sec = bulletRefs.slice(3, 4).map((r) => change(r, "formal")).filter(Boolean);
  if (sec.length) cards.push({ kind: "section", title: "Tighten the tone of this section", body: "A steadier, more professional voice across the section.", changes: sec });
  return cards;
}
const suggestionsView = (resumeId, d, extra = {}) => {
  const cards = openCards(resumeId);
  return { status: "ok", suggestions: cards.map((p) => proposalView(p, d)), contentHash: `mock-${d.version}`, ...(cards.some((p) => p.version !== d.version) ? { staleAt: new Date(Date.parse(d.updatedAt ?? new Date().toISOString()) + 10 * 60_000).toISOString() } : {}), ...extra };
};

function handleAi(req, res, path, method) {
  if (path === "/__mock/ai") {
    req.resume();
    const q = new URL(req.url, "http://x").searchParams;
    if (q.get("plan")) PRO = q.get("plan") === "pro";
    if (q.get("mode")) AI_MODE = q.get("mode");
    if (q.get("used")) aiUsed = Number(q.get("used"));
    json(res, 200, { pro: PRO, mode: AI_MODE, used: aiUsed });
    return true;
  }
  const m = path.match(/^\/api\/profile\/resumes\/(\d+)\/ai\/(rewrite|summary|proposals|suggestions)$/);
  const a = path.match(/^\/api\/profile\/ai\/proposals\/(\d+)\/(apply|dismiss)$/);
  if (!m && !a) return false;
  if (!subOf(req)) {
    req.resume();
    json(res, 401, { error: "Unauthorized" });
    return true;
  }
  if (!PRO) {
    req.resume();
    json(res, 402, { status: 402, code: "PRO_REQUIRED", title: "PRO_REQUIRED", message: "AI rewriting is part of Kiwiply Pro" });
    return true;
  }

  if (m) {
    const id = Number(m[1]);
    const d = DOCS.get(id);
    if (!d) {
      req.resume();
      json(res, 404, { status: 404, title: "Not Found" });
      return true;
    }
    if (m[2] === "proposals" && method === "GET") {
      req.resume();
      json(res, 200, [...AI_PROPOSALS.values()].filter((p) => p.resumeId === id && p.status === "OPEN").reverse().map((p) => proposalView(p, d)));
      return true;
    }
    if (m[2] === "suggestions" && method === "GET") {
      req.resume();
      json(res, 200, suggestionsView(id, d));
      return true;
    }
    if (method !== "POST") {
      req.resume();
      json(res, 405, { error: "Method not allowed" });
      return true;
    }
    withBody(req, (b) => {
      if (b.consent !== true) return json(res, 200, { status: "consentRequired", usage: aiUsage() });
      if (m[2] === "suggestions") {
        const open = openCards(id);
        // The same document is answered from the stored cards at zero cost, unless the person asked to refresh.
        if (open.length > 0 && open.every((p) => p.version === d.version) && b.refresh !== true) return json(res, 200, suggestionsView(id, d, { status: "cached", usage: aiUsage() }));
      }
      if (AI_MODE === "disabled") return json(res, 200, { status: "disabled" });
      if (AI_MODE === "quota") return json(res, 200, { status: "quotaExceeded", usage: aiUsage({ used: 100 }) });
      if (AI_MODE === "daily") return json(res, 200, { status: "quotaExceeded", cap: "daily", usage: { used: 40, limit: 40, resetsAt: new Date(Date.now() + 86_400_000).toISOString(), economy: false } });
      if (AI_MODE === "fail") return json(res, 502, { status: "error", error: "Couldn't reach Kiwiply AI right now - try again." });
      const respond = () => {
        if (m[2] === "suggestions") {
          const fresh = AI_MODE === "nothing" ? [] : mockCards(d.doc);
          if (fresh.length === 0) return json(res, 200, { status: "nothingToChange", suggestions: [], usage: aiUsage(), dropped: 0 });
          aiUsed = Math.min(99, aiUsed + 1);
          for (const old of openCards(id)) old.status = "DISMISSED"; // the fresh set replaces the cards it supersedes
          for (const c of fresh) {
            const p = { id: nextProposalId++, resumeId: id, task: "suggest", mode: null, version: d.version, status: "OPEN", createdAt: new Date().toISOString(), changes: c.changes, kind: c.kind, title: c.title, body: c.body };
            AI_PROPOSALS.set(p.id, p);
          }
          return json(res, 200, suggestionsView(id, d, { usage: aiUsage(), dropped: 0 }));
        }
        const lines = aiLines(d.doc);
        const changes = [];
        const mode = m[2] === "rewrite" ? String(b.mode ?? "stronger") : null;
        if (m[2] === "rewrite") {
          if (!["stronger", "shorter", "formal", "plain", "grammar"].includes(mode)) return json(res, 400, { code: "INVALID_MODE", message: "mode must be one of formal, grammar, plain, shorter, stronger" });
          const refs = Array.isArray(b.refs) ? b.refs : [];
          if (refs.length === 0 || refs.length > 12 || refs.some((r) => !lines.has(r))) return json(res, 400, { code: "INVALID_REFS", message: "Pick up to 12 lines of this resume" });
          for (const ref of refs) {
            const line = lines.get(ref);
            const alts = mockAlternatives(line.text, mode);
            if (alts.length === 0) continue;
            changes.push({
              ref, section: line.section, before: line.text, after: alts[0], ...(alts.length > 1 ? { alternatives: alts } : {}),
              reason: { stronger: "Opens with a strong verb and keeps your facts", shorter: "Same facts in fewer words", formal: "A more professional tone", plain: "Simpler words", grammar: "Fixed capitalisation and punctuation" }[mode],
              sources: [ref], formatted: line.formatted,
            });
          }
        } else {
          const sum = d.doc.sections.find((s) => s.kind === "SUMMARY")?.items?.[0];
          const base = sum?.text?.trim() || "Product designer";
          changes.push({
            ref: "summary", section: "Summary", before: sum?.text ?? "",
            after: `${noDot(base)}, shipping design systems used by teams.`, alternatives: [`${noDot(base)}, shipping design systems used by teams.`, `${noDot(base)} focused on clear, measurable outcomes.`],
            reason: "Drafted from what your resume already says", sources: [], formatted: false,
          });
        }
        if (changes.length === 0) return json(res, 200, { status: "nothingToChange", usage: aiUsage(), dropped: 0 });
        aiUsed = Math.min(99, aiUsed + 1);
        const p = { id: nextProposalId++, resumeId: id, task: m[2] === "rewrite" ? "rewrite" : "summary", mode, version: d.version, status: "OPEN", createdAt: new Date().toISOString(), changes };
        AI_PROPOSALS.set(p.id, p);
        json(res, 200, { status: "ok", proposal: proposalView(p, d), usage: aiUsage() });
      };
      if (AI_MODE === "slow") setTimeout(respond, 2500);
      else respond();
    });
    return true;
  }

  const pid = Number(a[1]);
  const p = AI_PROPOSALS.get(pid);
  if (!p) {
    req.resume();
    json(res, 404, { status: 404, title: "Not Found" });
    return true;
  }
  if (a[2] === "dismiss") {
    req.resume();
    if (p.status === "OPEN") p.status = "DISMISSED";
    res.writeHead(204);
    res.end();
    return true;
  }
  withBody(req, (b) => {
    const d = DOCS.get(p.resumeId);
    if (p.status !== "OPEN") return problem(res, 409, "PROPOSAL_CLOSED", { message: "This suggestion was already used or dismissed" });
    const keep = Array.isArray(b.keep) ? b.keep : [];
    if (keep.length === 0) return problem(res, 400, "KEEP_EMPTY", { message: "Keep at least one change" });
    if (!d || p.version !== d.version) return problem(res, 409, "PROPOSAL_STALE", { message: "Your resume changed since this suggestion was made", serverVersion: d?.version });
    const texts = new Map();
    for (const ref of keep) {
      const c = p.changes.find((x) => x.ref === ref);
      if (!c) return problem(res, 400, "UNKNOWN_REF", { message: `That change is not in this suggestion: ${ref}` });
      const alts = c.alternatives ?? [c.after];
      const idx = Number(b.alternatives?.[ref] ?? 0);
      if (!Number.isInteger(idx) || idx < 0 || idx >= alts.length) return problem(res, 400, "BAD_ALTERNATIVE", { message: `No alternative ${idx} for ${ref}` });
      if (alts[idx].toLowerCase().includes("[add a number]")) return problem(res, 422, "PLACEHOLDER_REMAINS", { message: "Replace [add a number] with a real number before applying", ref });
      texts.set(ref, alts[idx]);
    }
    const lines = aiLines(d.doc);
    for (const [ref, text] of texts) {
      const node = ref === "summary" ? d.doc.sections.find((s) => s.kind === "SUMMARY")?.items?.[0] : lines.get(ref)?.node;
      if (!node) return problem(res, 409, "PROPOSAL_STALE", { message: "That line is no longer in your resume" });
      node.text = text;
      delete node.marks;
      node.src = "ai";
    }
    p.status = "APPLIED";
    const wasVersion = d.version;
    d.version += 1;
    d.updatedAt = new Date().toISOString();
    // The other open suggestion cards stay usable (re-pinned to the new version) when the lines they propose to change still read as they did.
    const after = aiLines(d.doc);
    for (const o of openCards(p.resumeId)) {
      if (o.version === wasVersion && o.changes.every((c) => after.get(c.ref)?.text === c.before)) o.version = d.version;
    }
    withEtag(res, 200, docDto(p.resumeId), d.version);
  });
  return true;
}

/* ── My Resumes + "New resume" start chooser mock (R2.6; in memory) ──────────────────────────────── */
// MOCK_RESUME_LIMIT is the plan's live-resume cap (default 3 = Free, which the seeded demo is already over, so
// the cap prompt shows); start with MOCK_RESUME_LIMIT=25 to try the four chooser sources.
const RESUME_LIMIT = Number(process.env.MOCK_RESUME_LIMIT ?? FREE_RESUME_LIMIT);
const liveCount = () => RESUMES.filter((r) => !r.archived).length;
const capProblem = (res) =>
  json(res, 402, {
    status: 402,
    code: "RESUME_LIMIT",
    detail: RESUME_LIMIT <= FREE_RESUME_LIMIT ? "Free accounts keep up to 3 resumes — archive one, or upgrade to Pro." : `Pro accounts keep up to ${RESUME_LIMIT} resumes — archive one to add another`,
    plan: RESUME_LIMIT <= FREE_RESUME_LIMIT ? "FREE" : "PRO",
    limit: RESUME_LIMIT,
    count: liveCount(),
  });

/** The builder settings the web reads (`GET /api/profile/resume-builder/config`), with the live resume count. */
function builderConfig(empty = false) {
  const pro = PRO; // MOCK_PRO=1 / MOCK_RESUME_LIMIT>3 / GET /__mock/ai?plan=pro
  return {
    templates: { enabled: ["modern"], default: "modern", overrides: {}, popular: ["modern"] },
    limits: { sections: 20, items: 40, bullets: 12, bulletChars: 600, summaryChars: 2000, marks: 64, docBytes: 262144 },
    score: {
      rulesetVersion: "v1",
      weights: {},
      groupWeights: { G1: 15, G2: 25, G3: 20, G4: 20, G5: 20, G6: 10 },
      passThreshold: 0.7,
      bands: [
        { min: 80, title: "Great match!", body: "Your resume is well-optimized and ready to impress." },
        { min: 60, title: "Good progress", body: "A few fixes will make it stand out." },
        { min: 40, title: "Getting there", body: "Follow the tips below to strengthen it." },
        { min: 0, title: "Needs work", body: "Start with the checklist below." },
      ],
    },
    match: { weights: { skills: 50, title: 15, years: 10, industry: 15, education: 10 }, keySkillsCount: 10, thresholds: { keySkills: 0.7, experience: 0.6, industry: 0.6 }, maxJdChars: 8000, embeddings: false },
    theme: { accentPalette: ["#16a34a", "#2563eb", "#7c3aed", "#ec4899", "#f97316", "#eab308"] },
    features: { photo: true, docx: false, aiSuggestions: true, jobMatch: true, tailor: true, printLayout: true, pdfView: true, shareLinks: true },
    ai: { suggestAutoRefresh: false, suggestStaleMinutes: 10, rewriteMaxRefs: 12 },
    plan: pro ? "PRO" : "FREE",
    aiAllowed: pro,
    resumes: { count: empty ? 0 : liveCount(), max: pro ? Math.max(RESUME_LIMIT, 25) : RESUME_LIMIT },
    profile: { itemMaxBytes: 16384, maxItemsPerUser: 500, maxImportItems: 200, bioValueMaxChars: 500, bioSummaryMaxChars: 2000, setupPromptBelowPercent: 40, uploadMaxBytes: 10485760 },
    pdf: { waitMs: 30000, viewAutoRefresh: false },
    share: { maxLinks: 3 },
    versions: { retentionAuto: 30 },
    // Onboarding v2 (R1.8 / R1.9): the declared defaults (ResumeBuilderSettingKeys).
    onboarding: {
      enabled: true,
      estimateMinutes: 2,
      stepSeconds: { hello: 10, source: 40, review: 45, skills: 20, you: 15, prefs: 30 },
      draftMaxBytes: 262144,
      card: { snoozeDays: 3, resurfaceBelowPercent: 20, resurfaceAfterDays: 14, maxResurfaces: 2 },
      confetti: true,
      mascot: true,
      personaStep: true,
      payoffActions: ["build_resume", "install_extension", "find_jobs"],
      // The delight layer (R1.14): the declared defaults.
      delight: {
        enabled: true,
        haptics: true,
        combo: true,
        highlights: true,
        milestones: true,
        interstitialMs: 1200,
        interstitials: ["review"],
        barRider: false,
        share: true,
        copy: {},
      },
    },
    list: {
      quickTips: ["Create different resumes for different roles", "Tailor your resume for each job application", "Use AI suggestions to improve your content", "Keep one primary resume for quick applications"],
      virtualizeAbove: 60,
    },
  };
}

/** One row of GET /api/profile/resumes with the metadata model (R3.9) the list reads. */
function listRow(r) {
  const d = DOCS.get(r.id);
  const built = r.kind === "BUILT" && d;
  const lifecycle = r.archived ? "ARCHIVED" : built && !d.checkpoint && !d.exportedAt ? "DRAFT" : "ACTIVE";
  return {
    ...r,
    primary: !!r.defaultResume,
    updatedAt: d?.updatedAt ?? r.updatedAt ?? r.createdAt,
    lifecycle,
    target: r.target ?? null,
    tags: r.tags ?? [],
    role: r.role ?? "MASTER",
    ...(d ? { contentHash: `mock-${d.version}`, exportedHash: d.exportedHash ?? null, exportedAt: d.exportedAt ?? null } : {}),
    ...(built ? { pdf: { status: d.exportedHash && d.exportedHash !== "stale-hash" ? "READY" : "NONE" } } : {}),
    ...(d?.score?.score != null ? { score: d.score.score } : r.score != null ? { score: r.score } : {}),
  };
}
RESUMES.find((r) => r.id === 3).score = 82;
RESUMES.find((r) => r.id === 3).target = "Product Manager";
RESUMES.find((r) => r.id === 3).tags = ["growth", "b2b"];
RESUMES.find((r) => r.id === 4).score = 54;
DOCS.get(3).checkpoint = true;

const regenIds = (node) => {
  if (Array.isArray(node)) return node.map(regenIds);
  if (node && typeof node === "object") {
    const out = {};
    for (const [k, v] of Object.entries(node)) out[k] = k === "id" && typeof v === "string" && /^[a-z]_/.test(v) ? docId(v[0]) : regenIds(v);
    return out;
  }
  return node;
};

/** A document from a parsed upload (ResumeDocumentSeeder.fromStructured, simplified), honouring the KeepMask. */
function docFromStructured(title, s, bio, keep = {}) {
  const kept = (list, key) => (s[list] ?? []).filter((_, i) => !Array.isArray(keep[key]) || keep[key].includes(i));
  const doc = scratchDoc(title);
  Object.assign(doc.basics, Object.fromEntries(Object.entries({ name: [bio?.firstName, bio?.lastName].filter(Boolean).join(" ") || doc.basics.name, email: bio?.email }).filter(([, v]) => v)));
  if (keep.summary !== false && s.summary) doc.sections.push({ id: docId("s"), kind: "SUMMARY", title: "Summary", items: [{ id: docId("i"), text: String(s.summary), src: "parsed" }] });
  const exp = kept("experience", "experience");
  if (exp.length) doc.sections.push({ id: docId("s"), kind: "EXPERIENCE", title: "Experience", items: exp.map((e) => ({ id: docId("i"), title: e.title ?? "", org: e.company ?? "", location: e.location ?? "", start: /^\d{4}(-\d{2})?$/.test(e.startDate ?? "") ? e.startDate : null, end: null, current: !!e.current, bullets: (e.bullets ?? []).map((t) => ({ id: docId("b"), text: String(t), src: "parsed" })) })) });
  const edu = kept("education", "education");
  if (edu.length) doc.sections.push({ id: docId("s"), kind: "EDUCATION", title: "Education", items: edu.map((e) => ({ id: docId("i"), school: e.school ?? "", degree: e.degree ?? "", field: e.field ?? "", bullets: [] })) });
  if (keep.skills !== false && (s.skills ?? []).length) doc.sections.push({ id: docId("s"), kind: "SKILLS", title: "Skills", items: [{ id: docId("i"), group: "Skills", skills: s.skills.map(String) }] });
  const proj = kept("projects", "projects");
  if (proj.length) doc.sections.push({ id: docId("s"), kind: "PROJECTS", title: "Projects", items: proj.map((p) => ({ id: docId("i"), title: p.name ?? "", bullets: (p.bullets ?? []).map((t) => ({ id: docId("b"), text: String(t), src: "parsed" })) })) });
  return doc;
}
const scratchDoc = (title) => ({
  schema: 2,
  meta: { title, target: null, language: "en", originalFileKey: null },
  basics: { name: `${BIO.firstName} ${BIO.lastName}`, headline: BIO.headline, email: BIO.email, location: `${BIO.city}, ${BIO.state}`, links: [] },
  sections: [],
});

const newBuilt = (label, doc, source, extra = {}) => {
  const rid = nextResumeId++;
  const now = new Date().toISOString();
  const resume = { id: rid, kind: "BUILT", templateId: "modern", label, status: "CONFIRMED", createdAt: now, defaultResume: false, starred: false, archived: false, parsedJson: "{}", ...extra };
  RESUMES.push(resume);
  DOCS.set(rid, { doc, templateId: "modern", theme: null, version: 1, updatedAt: now, sourceKind: source });
  return resume;
};

/** `POST /built` with a `source`, duplicate, import, original, metadata PATCH and delete. True when answered. */
function handleSources(req, res, path, method) {
  if (path === "/api/profile/resume-builder/config" && method === "GET") {
    req.resume();
    json(res, 200, builderConfig(isEmptyAccount(subOf(req))));
    return true;
  }
  const m = path.match(/^\/api\/profile\/resumes\/(\d+)(?:\/(doc\/duplicate|doc\/import|original))?$/);
  const isBuilt = path === "/api/profile/resumes/built" && method === "POST";
  if (!isBuilt && !m) return false;
  if (!subOf(req)) {
    req.resume();
    json(res, 401, { error: "Unauthorized" });
    return true;
  }
  const id = m ? Number(m[1]) : null;
  const r = id != null ? RESUMES.find((x) => x.id === id) : null;
  const tail = m?.[2];
  if (m && !tail && method !== "DELETE") return false; // GET/PUT of a plain resume: the generic handlers

  if (isBuilt) {
    withBody(req, (b) => {
      if (liveCount() >= RESUME_LIMIT) return capProblem(res);
      const src = typeof b.source === "string" ? { kind: b.source } : (b.source ?? { kind: "profile" });
      const target = typeof b.target === "string" && b.target.trim() ? b.target.trim().slice(0, 80) : null;
      if (!["profile", "scratch", "upload", "copy"].includes(src.kind)) return problem(res, 422, "DOC_INVALID", { path: "$.source.kind", message: `unknown source '${src.kind}'` });
      let doc;
      let title = String(b.label || "").trim();
      let kind = "PROFILE";
      if (src.kind === "upload") {
        if (!src.structured || typeof src.structured !== "object") return problem(res, 422, "DOC_INVALID", { path: "$.source.structured", message: "is required for an upload" });
        const keep = src.keep ?? {};
        for (const list of ["experience", "education", "projects"]) {
          for (const [i, item] of (src.structured[list] ?? []).entries()) {
            if (Array.isArray(keep[list]) && !keep[list].includes(i)) continue;
            const hit = findSensitive(item, `structured.${list}[${i}]`);
            if (hit) return json(res, 422, { status: 422, code: "SENSITIVE_CONTENT", path: hit, class: "SSN_ITIN", message: "We never store a Social Security or tax identification number - please remove it" });
          }
        }
        title = title || String(src.fileName ?? "").replace(/\.[^.]+$/, "") || target || "My resume";
        doc = docFromStructured(title, src.structured, src.bio, keep);
        kind = "UPLOAD";
      } else if (src.kind === "copy") {
        const from = RESUMES.find((x) => x.id === src.fromResumeId);
        if (!from) return json(res, 404, { status: 404, title: "Not Found" });
        title = title || `${from.label} (copy)`;
        const fd = DOCS.get(from.id);
        doc = fd ? regenIds(structuredClone(fd.doc)) : docFromStructured(title, JSON.parse(from.parsedJson || "{}"), null);
        doc.meta = { ...doc.meta, target: null, originalFileKey: null };
        kind = "COPY";
      } else if (src.kind === "scratch") {
        title = title || target || "My resume";
        doc = scratchDoc(title);
      } else {
        title = title || target || "My resume";
        doc = seedDoc(title);
      }
      doc.meta.title = title.slice(0, 200);
      doc.meta.target = target;
      const resume = newBuilt(doc.meta.title, doc, kind, { target });
      const d = DOCS.get(resume.id);
      if (kind === "COPY") d.parent = src.fromResumeId;
      withEtag(res, 201, { resume: listRow(resume), doc: docDto(resume.id) }, 1);
    });
    return true;
  }

  if (!r) {
    req.resume();
    json(res, 404, { status: 404, title: "Not Found" });
    return true;
  }

  if (tail === "doc/duplicate" && method === "POST") {
    req.resume();
    if (liveCount() >= RESUME_LIMIT) return capProblem(res), true;
    const fd = DOCS.get(r.id);
    const title = `${r.label} (copy)`.slice(0, 200);
    const doc = fd ? regenIds(structuredClone(fd.doc)) : docFromStructured(title, JSON.parse(r.parsedJson || "{}"), null);
    doc.meta = { ...doc.meta, title, target: null, originalFileKey: null };
    const resume = newBuilt(title, doc, "COPY");
    DOCS.get(resume.id).parent = r.id;
    withEtag(res, 201, { resume: listRow(resume), doc: docDto(resume.id) }, 1);
    return true;
  }

  if (tail === "doc/import" && method === "POST") {
    req.resume();
    if (r.kind === "BUILT") return problem(res, 409, "ALREADY_BUILT"), true;
    const doc = docFromStructured(r.label, JSON.parse(r.parsedJson || "{}"), null);
    r.kind = "BUILT";
    r.templateId = "modern";
    DOCS.set(r.id, { doc, templateId: "modern", theme: null, version: 1, updatedAt: new Date().toISOString(), sourceKind: "IMPORT" });
    withEtag(res, 200, { resume: listRow(r), doc: docDto(r.id) }, 1);
    return true;
  }

  if (tail === "original" && method === "GET") {
    req.resume();
    const d = DOCS.get(r.id);
    if (!d?.originalBytes) return json(res, 404, { status: 404, title: "Not Found" }), true;
    res.writeHead(200, { "content-type": "application/pdf" });
    res.end("%PDF-1.4 mock original");
    return true;
  }

  if (!tail && method === "DELETE") {
    req.resume();
    const used = APPLICATIONS.some((a) => a.resume?.id === r.id);
    if (used) return json(res, 409, { status: 409, detail: "This resume is used by a tracked application — archive it instead." }), true;
    RESUMES.splice(RESUMES.indexOf(r), 1);
    DOCS.delete(r.id);
    if (!RESUMES.some((x) => x.defaultResume && !x.archived)) {
      const first = RESUMES.find((x) => !x.archived);
      if (first) first.defaultResume = true;
    }
    res.writeHead(204);
    res.end();
    return true;
  }
  req.resume();
  json(res, 405, { error: "Method not allowed" });
  return true;
}

/* ── Resume metadata mock (R3.9 / R3.10 contract; in memory) ──────────────────────────────────────
 * meta GET/PATCH, the master to tailored lineage (resume 6 is a copy of resume 3 whose master has moved on),
 * versions with checkpoint / text / restore, and sync-master. Dev only, like the builder above. */
const clone = (x) => JSON.parse(JSON.stringify(x));
const VERS = new Map(); // resume id -> [{ versionNo, reason, name, createdAt, by, doc, templateId, theme }] (oldest first)
const TAIL = new Map(); // tailored resume id -> { parent, snapshot (the master's doc when it was copied) }
const VERSION_COALESCE_MS = 5 * 60 * 1000; // resume.versions.coalesceMinutes
const AUTO_KEEP = 30; // resume.versions.retentionAuto
const actorOf = (req) => {
  const sub = subOf(req) ?? "demo";
  const a = ACCOUNTS[sub];
  return { login: sub, label: a ? `${a.firstName} ${a.lastName}` : "Priya Sharma" };
};
const kindOf = (reason) => (reason === "AUTOSAVE" ? "auto" : reason === "NAMED" ? "named" : reason === "MANUAL" ? "checkpoint" : "system");

function versionsOf(id) {
  if (!VERS.has(id) && DOCS.has(id)) {
    const d = DOCS.get(id);
    VERS.set(id, [{ versionNo: 1, reason: "IMPORT", name: null, createdAt: RESUMES.find((r) => r.id === id)?.createdAt ?? new Date().toISOString(), by: null, doc: clone(d.doc), templateId: d.templateId, theme: d.theme }]);
  }
  return VERS.get(id) ?? [];
}
function addVersion(id, reason, name) {
  const rows = versionsOf(id);
  const d = DOCS.get(id);
  const row = { versionNo: (rows.at(-1)?.versionNo ?? 0) + 1, reason, name: name || null, createdAt: new Date().toISOString(), by: null, doc: clone(d.doc), templateId: d.templateId, theme: d.theme };
  rows.push(row);
  const auto = rows.filter((r) => r.reason !== "MANUAL" && r.reason !== "NAMED");
  for (const old of auto.slice(0, Math.max(0, auto.length - AUTO_KEEP))) rows.splice(rows.indexOf(old), 1);
  return row;
}
// A row with no `by` was written by the resume's owner (the only user of the mock).
/** The autosave policy: changed content, and not inside the coalescing window of the previous row. */
function recordAutosave(id) {
  const rows = versionsOf(id);
  const last = rows.at(-1);
  const d = DOCS.get(id);
  if (last && JSON.stringify(last.doc) === JSON.stringify(d.doc)) return;
  if (last && Date.now() - Date.parse(last.createdAt) < VERSION_COALESCE_MS) return;
  addVersion(id, "AUTOSAVE", null);
}

/** A small ATS-style text of a document (the real one is ResumeDocumentText). */
function docText(doc) {
  const out = [doc.basics?.name, doc.basics?.headline, [doc.basics?.email, doc.basics?.location].filter(Boolean).join(" | ")].filter(Boolean);
  for (const s of doc.sections ?? []) {
    if (s.hidden || !s.items?.length) continue;
    out.push("", String(s.title || s.kind).toUpperCase());
    for (const it of s.items) {
      if (s.kind === "SUMMARY") out.push(it.text);
      else if (s.kind === "SKILLS") out.push(`${it.group ? it.group + ": " : ""}${(it.skills ?? []).join(", ")}`);
      else {
        out.push([it.title ?? it.degree, it.org ?? it.school].filter(Boolean).join(", "));
        for (const b of it.bullets ?? []) out.push(`- ${b.text}`);
      }
    }
  }
  return out.join("\n") + "\n";
}

const itemsById = (doc) => {
  const m = new Map();
  for (const s of doc.sections ?? []) for (const it of s.items ?? []) m.set(it.id, { kind: s.kind, title: s.title, item: it });
  return m;
};
/** What the master did since the copy: items added / changed / removed, by id. */
function masterChanges(childId) {
  const t = TAIL.get(childId);
  const master = DOCS.get(t.parent);
  const before = itemsById(t.snapshot);
  const after = itemsById(master.doc);
  const out = [];
  for (const [id, a] of after) {
    const b = before.get(id);
    if (!b) out.push({ id, kind: "added", section: a.title || a.kind, after: a.item });
    else if (JSON.stringify(b.item) !== JSON.stringify(a.item)) out.push({ id, kind: "changed", section: a.title || a.kind, before: b.item, after: a.item });
  }
  for (const [id, b] of before) if (!after.has(id)) out.push({ id, kind: "removed", section: b.title || b.kind, before: b.item });
  return out;
}
const masterChanged = (childId) => TAIL.has(childId) && masterChanges(childId).length > 0;

function metaDto(id, req) {
  const r = RESUMES.find((x) => x.id === id);
  const d = DOCS.get(id);
  const tail = TAIL.get(id);
  const built = r.kind === "BUILT" && d;
  const links = LINKS.filter((l) => l.resumeId === id && !l.revokedAt);
  const rows = built ? versionsOf(id) : [];
  const latest = rows.at(-1);
  const masterId = tail ? tail.parent : id;
  const master = RESUMES.find((x) => x.id === masterId);
  const me = actorOf(req);
  return {
    id, name: r.label, kind: r.kind,
    source: { kind: r.kind, origin: built ? (tail ? "TAILOR" : "PROFILE") : null, tailoredFrom: tail ? { resumeId: tail.parent, label: master.label, job: tail.job } : null, madeBy: null, approvalRequired: false, approvedAt: null },
    target: r.target ?? null, tags: r.tags ?? [], primary: !!r.defaultResume, starred: !!r.starred, archived: !!r.archived,
    lifecycle: r.archived ? "ARCHIVED" : rows.some((v) => v.reason === "MANUAL" || v.reason === "NAMED") ? "ACTIVE" : "DRAFT",
    role: tail ? "TAILORED" : "MASTER", templateId: built ? d.templateId : null,
    createdAt: r.createdAt, createdBy: me, updatedAt: d?.updatedAt ?? r.createdAt, updatedBy: me, lastExportedAt: d?.exportedAt ?? null, score: null,
    pdf: built ? { status: "READY", hash: null, generatedAt: d.exportedAt ?? null, attempts: 0, error: null } : null,
    shareWithOrg: r.shareWithOrg !== false,
    lineage: { masterId, masterName: master.label, masterChanged: masterChanged(id), children: [...TAIL.values()].filter((t) => t.parent === id).length },
    visibility: { mode: "PRIVATE", orgPaired: null, orgScope: null, shareWithOrg: r.shareWithOrg !== false, people: 0 },
    recruiterSharing: { on: links.length > 0, links: links.length, views: links.reduce((n, l) => n + l.viewCount, 0) },
    version: { current: latest?.versionNo ?? 0, latest: latest ? { name: latest.name, createdAt: latest.createdAt, kind: kindOf(latest.reason) } : null },
    hasOriginal: !!d?.originalBytes,
  };
}

function handleMeta(req, res, path, method) {
  const m = path.match(/^\/api\/profile\/resumes\/(\d+)\/(meta|lineage|detach|doc\/(?:checkpoint|versions|versions\/\d+\/text|versions\/\d+\/restore|sync-master|sync-master\/apply))$/);
  if (!m) return false;
  if (!subOf(req)) {
    req.resume();
    return json(res, 401, { error: "Unauthorized" }), true;
  }
  const id = Number(m[1]);
  const what = m[2];
  const r = RESUMES.find((x) => x.id === id);
  if (!r) {
    req.resume();
    return json(res, 404, { status: 404, title: "Not Found" }), true;
  }
  const built = r.kind === "BUILT" && DOCS.has(id);
  const d = DOCS.get(id);
  const webBase = process.env.MOCK_WEB_URL ?? "http://localhost:3000";
  void webBase;

  if (what === "meta" && method === "GET") {
    req.resume();
    return json(res, 200, metaDto(id, req)), true;
  }
  if (what === "meta" && method === "PATCH") {
    withBody(req, (b) => {
      const bad = (path2, message) => json(res, 422, { status: 422, code: "META_INVALID", title: message, path: path2, message });
      if ("name" in b) {
        if (typeof b.name !== "string" || !b.name.trim()) return bad("$.name", "must not be blank");
        if (b.name.trim().length > 200) return bad("$.name", "must be at most 200 characters");
      }
      if (b.primary === false && r.defaultResume && !r.archived) return json(res, 409, { status: 409, code: "PRIMARY_REQUIRED", title: "Pick another resume as primary instead of unsetting this one" });
      if (b.primary === true && (b.archived ?? r.archived)) return bad("$.primary", "an archived resume cannot be primary");
      if (b.archived === true && !r.archived && r.defaultResume && RESUMES.some((x) => x.id !== r.id && !x.archived)) {
        return json(res, 409, { status: 409, code: "PRIMARY_REQUIRED", title: "This is your primary resume: make another one primary before archiving it", message: "This is your primary resume: make another one primary before archiving it" });
      }
      if ("name" in b) {
        r.label = b.name.trim();
        if (d) d.doc.meta.title = r.label;
      }
      if ("target" in b) r.target = b.target ? String(b.target).trim() || null : null;
      if (Array.isArray(b.tags)) r.tags = b.tags.map(String);
      if (typeof b.starred === "boolean") r.starred = b.starred;
      if (typeof b.shareWithOrg === "boolean") r.shareWithOrg = b.shareWithOrg;
      if (typeof b.archived === "boolean") {
        r.archived = b.archived;
        if (b.archived) r.defaultResume = false;
      }
      if (b.primary === true) for (const x of RESUMES) x.defaultResume = x.id === id;
      if (!RESUMES.some((x) => x.defaultResume && !x.archived)) {
        const first = RESUMES.find((x) => !x.archived);
        if (first) first.defaultResume = true;
      }
      if (b.visibility === "PRIVATE") r.shareWithOrg = false;
      if (typeof b.recruiterSharing === "boolean") {
        const live = LINKS.filter((l) => l.resumeId === id && !l.revokedAt);
        if (b.recruiterSharing && live.length === 0) addLink(id);
        if (!b.recruiterSharing) for (const l of live) l.revokedAt = new Date().toISOString();
      }
      if (d && ("name" in b || "target" in b)) d.updatedAt = new Date().toISOString();
      json(res, 200, metaDto(id, req));
    });
    return true;
  }
  if (what === "lineage" && method === "GET") {
    req.resume();
    const tail = TAIL.get(id);
    const masterId = tail ? tail.parent : id;
    const master = RESUMES.find((x) => x.id === masterId);
    const children = [...TAIL.entries()]
      .filter(([, t]) => t.parent === masterId)
      .map(([cid, t]) => ({ id: cid, name: RESUMES.find((x) => x.id === cid).label, job: t.job, updatedAt: DOCS.get(cid).updatedAt, masterChanged: masterChanged(cid) }));
    return json(res, 200, { master: { id: masterId, name: master.label, updatedAt: DOCS.get(masterId)?.updatedAt ?? null }, children, self: tail ? "TAILORED" : "MASTER" }), true;
  }
  if (what === "detach" && method === "POST") {
    req.resume();
    if (!TAIL.has(id)) return json(res, 409, { status: 409, code: "NOT_TAILORED", title: "This resume is not a tailored copy" }), true;
    TAIL.delete(id);
    addVersion(id, "DETACH", null);
    return json(res, 200, metaDto(id, req)), true;
  }

  // everything below needs a built document
  if (!built) {
    req.resume();
    return json(res, 404, { status: 404, title: "Not Found" }), true;
  }
  if (what === "doc/checkpoint" && method === "POST") {
    withBody(req, (b) => {
      const name = typeof b.name === "string" ? b.name.trim() : "";
      if (name.length > 80) return json(res, 422, { status: 422, code: "DOC_INVALID", message: "name must be at most 80 characters", path: "$.name" });
      const row = addVersion(id, name ? "NAMED" : "MANUAL", name);
      json(res, 200, { versionNo: row.versionNo, reason: row.reason, pdf: { status: "PENDING", attempts: 0 } });
    });
    return true;
  }
  if (what === "doc/versions" && method === "GET") {
    req.resume();
    return json(res, 200, versionsOf(id).slice().reverse().map((v) => ({ versionNo: v.versionNo, reason: v.reason, name: v.name, createdAt: v.createdAt, contentHash: `mock-v${v.versionNo}`, by: v.by ?? actorOf(req), kind: kindOf(v.reason) }))), true;
  }
  const vm = what.match(/^doc\/versions\/(\d+)\/(text|restore)$/);
  if (vm) {
    const row = versionsOf(id).find((v) => v.versionNo === Number(vm[1]));
    if (!row) {
      req.resume();
      return json(res, 404, { status: 404, title: "Not Found" }), true;
    }
    if (vm[2] === "text" && method === "GET") {
      req.resume();
      res.writeHead(200, { "content-type": "text/plain;charset=UTF-8" });
      return res.end(docText(row.doc)), true;
    }
    if (vm[2] === "restore" && method === "POST") {
      req.resume();
      const last = versionsOf(id).at(-1);
      if (JSON.stringify(last.doc) !== JSON.stringify(d.doc)) addVersion(id, "AUTOSAVE", null); // what is here now is kept first
      d.doc = clone(row.doc);
      d.doc.meta.title = r.label; // the name is the resume's, not the old document's
      d.theme = row.theme;
      d.version += 1;
      d.updatedAt = new Date().toISOString();
      addVersion(id, "RESTORE", null);
      return withEtag(res, 200, docDto(id), d.version), true;
    }
  }
  if (what === "doc/sync-master" && method === "POST") {
    req.resume();
    if (!TAIL.has(id)) return json(res, 409, { status: 409, code: "NOT_TAILORED", title: "This resume is not a tailored copy" }), true;
    return json(res, 200, { changes: masterChanges(id) }), true;
  }
  if (what === "doc/sync-master/apply" && method === "POST") {
    withBody(req, (b) => {
      if (!TAIL.has(id)) return json(res, 409, { status: 409, code: "NOT_TAILORED", title: "This resume is not a tailored copy" });
      const t = TAIL.get(id);
      const picked = new Set(Array.isArray(b.ids) ? b.ids : []);
      const master = DOCS.get(t.parent);
      for (const c of masterChanges(id)) {
        if (!picked.has(c.id)) continue;
        for (const s of d.doc.sections) s.items = s.items.filter((it) => it.id !== c.id);
        if (c.kind === "removed") continue;
        const home = itemsById(master.doc).get(c.id);
        const sec = d.doc.sections.find((s) => s.kind === home.kind);
        if (sec) sec.items.push(clone(c.after));
      }
      t.snapshot = clone(master.doc); // "copied from" now reads as the master's current state
      d.version += 1;
      d.updatedAt = new Date().toISOString();
      addVersion(id, "AUTOSAVE", null);
      withEtag(res, 200, docDto(id), d.version);
    });
    return true;
  }
  req.resume();
  json(res, 405, { error: "Method not allowed" });
  return true;
}

// The seed for the header bar: resume 6 is a tailored copy of 3, and 3 has moved on since (one edit, one addition).
RESUMES.push({ id: 6, kind: "BUILT", templateId: "modern", label: "Product Manager @ Stripe", status: "CONFIRMED", createdAt: ago(8), defaultResume: false, starred: false, archived: false, parsedJson: "{}" });
// A tailored copy keeps the master's item ids (DESIGN 9.10), which is what lets "Pull changes" match items.
DOCS.set(6, { doc: { ...clone(DOCS.get(3).doc), meta: { ...DOCS.get(3).doc.meta, title: "Product Manager @ Stripe" } }, templateId: "modern", theme: null, version: 2, updatedAt: ago(1) });
TAIL.set(6, { parent: 3, job: { title: "Product Manager", company: "Stripe" }, snapshot: clone(DOCS.get(3).doc) });
{
  const master = DOCS.get(3).doc;
  const sum = master.sections.find((s) => s.kind === "SUMMARY");
  sum.items[0].text = "Product designer with 7 years shipping consumer and B2B products, now leading platform design.";
  master.sections.find((s) => s.kind === "SKILLS").items.push({ id: "i_mock_mentor", group: "Leadership", skills: ["Mentoring", "Hiring"] });
}
// A short history on resumes 3 and 4 so Version, Compare and Restore have something to show.
for (const id of [3, 4]) {
  const d = DOCS.get(id);
  const earlier = clone(d.doc);
  earlier.sections.find((s) => s.kind === "SUMMARY").items[0].text = "Designer building products people enjoy.";
  const rows = [
    { versionNo: 1, reason: "IMPORT", name: null, createdAt: ago(20), by: null, doc: clone(earlier), templateId: "modern", theme: null },
    { versionNo: 2, reason: "AUTOSAVE", name: null, createdAt: ago(9), by: null, doc: clone(earlier), templateId: "modern", theme: null },
    { versionNo: 3, reason: "NAMED", name: "Before tailoring", createdAt: ago(3), by: null, doc: clone(d.doc), templateId: "modern", theme: null },
  ];
  rows[1].doc.sections.find((s) => s.kind === "SUMMARY").items[0].text = "Product designer with 5 years shipping consumer products.";
  VERS.set(id, rows);
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
  if (isEmptyAccount(subOf(req)) && method === "GET") {
    req.resume();
    if (path === "/api/profile/completeness")
      json(res, 200, { score: 0, parts: {}, nextAction: { key: "identity", label: "Complete your name, email and phone", href: "/profiles?tab=personal" } });
    else json(res, 200, []);
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
  // The setup flow's one import (Onboarding v2): every kept entry becomes an item (no merge-by-identity in the mock).
  if (arg === "import" && method === "POST") {
    withBody(req, (b) => {
      let created = 0;
      for (const it of Array.isArray(b.items) ? b.items : []) {
        const data = it.dataJson ?? it.data;
        if (!it.section || !data || typeof data !== "object" || Array.isArray(data)) return problem(res, 422, "ITEM_INVALID", { path: "items", message: "must be a JSON object" });
        const hit = findSensitive(data, "dataJson");
        if (hit) return problem(res, 422, "SENSITIVE_CONTENT", { path: hit, class: "SSN_ITIN" });
        if (!isEmptyAccount(subOf(req))) ITEMS.push({ id: nextItemId++, section: it.section, position: ITEMS.filter((i) => i.section === it.section).length, data, provenance: it.provenance ?? "USER", sourceResumeId: null, hidden: false, updatedAt: new Date().toISOString() });
        created++;
      }
      json(res, 200, { created, merged: 0, updatedBio: !!b.bio });
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

/* ── Notification preferences mock (E2E-U7.0 contract; in memory per login, DEV ONLY) ──────────────────
 * GET/PUT /api/profile/notification-preferences like NotificationPreferenceResource: the admin-configured defaults until the
 * first save (stored:false), billing and security locked on, 422 for an unknown kind / bad time / bad zone, and - like the real
 * demo guard - a demo account's PUT is refused (403 DEMO_READ_ONLY). Fixture (non-demo) accounts save for real, in memory.
 * Control: POST /mock/notification-preferences/reset forgets every login's saved preferences.
 */
const NOTIFY_KINDS = [
  { kind: "APP_STATUS", title: "Application updates", description: "When an email moves one of your applications, like an interview invite or an offer.", locked: false, lockedWhy: null },
  { kind: "INTERVIEW_REMINDER", title: "Interview reminders", description: "A nudge before an interview you have on your calendar.", locked: false, lockedWhy: null },
  { kind: "PROFILE_SUGGESTION", title: "Profile suggestions", description: "When we learn something new about you from an application and want your okay.", locked: false, lockedWhy: null },
  { kind: "BILLING", title: "Billing", description: "Receipts, renewals and card problems.", locked: true, lockedWhy: "Needed so you never miss a payment issue." },
  { kind: "SECURITY", title: "Security", description: "New sign-ins and password changes.", locked: true, lockedWhy: "Needed to keep your account safe." },
  { kind: "SYSTEM", title: "Kiwiply news", description: "Product updates and the occasional announcement.", locked: false, lockedWhy: null },
];
const NOTIFY_DEFAULT_EMAIL = { APP_STATUS: "now", INTERVIEW_REMINDER: "now", PROFILE_SUGGESTION: "off", BILLING: "now", SECURITY: "now", SYSTEM: "off" };
const NOTIFY_PREFS = new Map(); // login -> { matrix, quietStart, quietEnd, tz, updatedAt }
const NOTIFY_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

function notifyView(login) {
  const saved = NOTIFY_PREFS.get(login);
  const matrix = Object.fromEntries(NOTIFY_KINDS.map((k) => [k.kind, saved?.matrix[k.kind] ?? { inapp: true, email: NOTIFY_DEFAULT_EMAIL[k.kind] }]));
  return {
    matrix,
    quietStart: saved?.quietStart ?? null,
    quietEnd: saved?.quietEnd ?? null,
    tz: saved?.tz ?? "UTC",
    stored: !!saved,
    emailEnabled: true,
    quietDefaults: { start: "22:00", end: "08:00" },
    kinds: NOTIFY_KINDS,
    updatedAt: saved?.updatedAt ?? null,
  };
}

/** Handles /api/profile/notification-preferences and the /mock/notification-preferences controls; true when answered. */
function handleNotificationPrefs(req, res, path, method) {
  if (path === "/mock/notification-preferences/reset") {
    req.resume();
    NOTIFY_PREFS.clear();
    return json(res, 200, { reset: true }), true;
  }
  if (path !== "/api/profile/notification-preferences") return false;
  const sub = subOf(req);
  if (!sub) {
    req.resume();
    return json(res, 401, { error: "Unauthorized" }), true;
  }
  if (method === "GET") {
    req.resume();
    return json(res, 200, notifyView(sub)), true;
  }
  if (method === "PUT") {
    if (!FIXTURE_ACCOUNTS[sub]) {
      req.resume();
      return json(res, 403, { code: "DEMO_READ_ONLY", message: "This is a demo account - changes aren't saved" }), true;
    }
    withBody(req, (b) => {
      const refuse = (why) => json(res, 422, { title: "Unprocessable Entity", status: 422, detail: why });
      const before = notifyView(sub);
      const matrix = { ...before.matrix };
      for (const [kind, v] of Object.entries(b.matrix ?? {})) {
        const info = NOTIFY_KINDS.find((k) => k.kind === kind);
        if (!info) return refuse("Unknown notification kind");
        if (typeof v?.inapp !== "boolean") return refuse("Say whether " + info.title + " shows in-app");
        const email = v.email ?? matrix[kind].email;
        if (email !== "off" && email !== "now") return refuse("Email is off or now");
        matrix[kind] = info.locked ? { inapp: true, email: "now" } : { inapp: v.inapp, email };
      }
      const start = b.quietStart || null;
      const end = b.quietEnd || null;
      if ((start && !NOTIFY_TIME.test(start)) || (end && !NOTIFY_TIME.test(end))) return refuse("Quiet hours are times like 22:00");
      if (!start !== !end) return refuse("Quiet hours need a start and an end");
      let tz = before.tz;
      if (b.tz) {
        try {
          new Intl.DateTimeFormat("en", { timeZone: b.tz });
        } catch {
          return refuse("That isn't a time zone we know");
        }
        tz = b.tz;
      }
      NOTIFY_PREFS.set(sub, { matrix, quietStart: start, quietEnd: end, tz, updatedAt: new Date().toISOString() });
      json(res, 200, notifyView(sub));
    });
    return true;
  }
  req.resume();
  return json(res, 405, { error: "Method not allowed" }), true;
}

/* ── Onboarding v2 mock (R1.8 contract, R1.9; in memory per login, DEV ONLY) ───────────────────────
 * GET /api/profile/onboarding[?include=state], PUT/DELETE /draft, PATCH, POST /finish, like OnboardingResource:
 * the draft is a conflict token (`updatedAt`) with 409 DRAFT_CONFLICT when `baseUpdatedAt` is stale, 413 / 422
 * (an SSN anywhere in the state), and the dashboard card decision (DESIGN 6). Unlike the real demo guard these writes
 * succeed, so the flow can be tried without the API. Every mock login starts as "finished" (the demos are seeded
 * onboarded); start the mock with MOCK_ONBOARDING_FRESH=1 to start unfinished, and drive the awkward cases with:
 *   curl -X POST http://localhost:<MOCK_API_PORT>/mock/onboarding/offline?on=1   draft calls then drop the connection (0 = back)
 *   curl -X POST http://localhost:<MOCK_API_PORT>/mock/onboarding/edit-elsewhere[?login=demo]   another device saves the draft
 *   curl -X POST http://localhost:<MOCK_API_PORT>/mock/onboarding/reset          forget every login's onboarding state
 */
const ONBOARDING = new Map(); // login -> { draft, persona, finishedAt, card }
const ONBOARDING_STEPS = new Set(["hello", "source", "review", "skills", "you", "prefs"]);
const ONBOARDING_PERSONAS = new Set(["student", "first_job", "switching", "experienced"]);
const ONBOARDING_MAX_BYTES = 262144;
const ONBOARDING_FRESH = process.env.MOCK_ONBOARDING_FRESH === "1";
const ONBOARDING_SNOOZE_DAYS = 3;
let onboardingOffline = false;

function onboardingOf(login) {
  let o = ONBOARDING.get(login);
  if (!o) {
    // a brand-new (fixture) account is never onboarded; the demo logins are seeded finished unless MOCK_ONBOARDING_FRESH=1
    o = { draft: null, persona: null, finishedAt: ONBOARDING_FRESH || isEmptyAccount(login) ? null : BIO.onboardedAt ?? null, card: { dismissedAt: null, snoozedUntil: null, resurfaceCount: 0 } };
    ONBOARDING.set(login, o);
  }
  return o;
}

/** A rough meter for an empty account: 8 points per filled bio field, from the bio the setup flow wrote. */
function emptyScore(login) {
  const bio = EMPTY_BIOS.get(login) ?? {};
  return Math.min(100, Object.values(bio).filter((v) => typeof v === "string" && v.trim() !== "").length * 8);
}

function onboardingStatus(login, includeState) {
  const o = onboardingOf(login);
  const score = isEmptyAccount(login) ? emptyScore(login) : completeness().score;
  const promptBelow = 40;
  const now = Date.now();
  const finished = !!o.finishedAt;
  let show = true;
  if (finished && score >= promptBelow) show = false;
  if (o.card.snoozedUntil && Date.parse(o.card.snoozedUntil) > now) show = false;
  if (o.card.dismissedAt) show = false;
  return {
    status: o.draft ? "DRAFT" : finished ? "FINISHED" : "NONE",
    persona: o.persona,
    finishedAt: o.finishedAt,
    draft: o.draft
      ? { step: o.draft.step, stepsDone: o.draft.stepsDone, stepsTotal: o.draft.stepsTotal, updatedAt: o.draft.updatedAt, ...(includeState ? { state: o.draft.state } : {}) }
      : null,
    card: { dismissedAt: o.card.dismissedAt, snoozedUntil: o.card.snoozedUntil, resurfaceCount: o.card.resurfaceCount, show, state: o.draft ? "IN_PROGRESS" : "NOT_STARTED", resurfaced: false },
    completeness: { score, promptBelow, resurfaceBelow: 20 },
  };
}

/** A strictly increasing ISO instant, so two saves in one millisecond still differ (the conflict token). */
let lastOnboardingStamp = 0;
const onboardingNow = () => new Date((lastOnboardingStamp = Math.max(Date.now(), lastOnboardingStamp + 1))).toISOString();

/** Handles /api/profile/onboarding/** and the /mock/onboarding/* controls; true when answered. */
function handleOnboarding(req, res, path, method) {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (path.startsWith("/mock/onboarding/")) {
    req.resume();
    const login = url.searchParams.get("login") ?? "demo";
    if (path === "/mock/onboarding/offline") {
      onboardingOffline = url.searchParams.get("on") !== "0";
      return json(res, 200, { offline: onboardingOffline }), true;
    }
    if (path === "/mock/onboarding/reset") {
      ONBOARDING.clear();
      EMPTY_BIOS.clear();
      onboardingOffline = false;
      return json(res, 200, { reset: true }), true;
    }
    if (path === "/mock/onboarding/edit-elsewhere") {
      const d = onboardingOf(login).draft;
      if (!d) return json(res, 404, { error: "no draft to edit" }), true;
      const state = { ...d.state, cursor: Math.min((d.state.cursor ?? 0) + 1, (d.state.parsed?.candidates ?? []).length), updatedAt: onboardingNow() };
      onboardingOf(login).draft = { ...d, state, updatedAt: onboardingNow() };
      return json(res, 200, { updatedAt: onboardingOf(login).draft.updatedAt, cursor: state.cursor }), true;
    }
    return json(res, 404, { error: "unknown mock control" }), true;
  }
  if (path !== "/api/profile/onboarding" && !path.startsWith("/api/profile/onboarding/")) return false;
  const sub = subOf(req);
  if (!sub) {
    req.resume();
    return json(res, 401, { error: "Unauthorized" }), true;
  }
  // The draft endpoints drop the connection while "offline" (the web's BFF then answers 502, which the client retries).
  if (onboardingOffline && path.endsWith("/draft")) {
    req.resume();
    req.socket.destroy();
    return true;
  }
  const o = onboardingOf(sub);
  if (path === "/api/profile/onboarding" && method === "GET") {
    req.resume();
    return json(res, 200, onboardingStatus(sub, url.searchParams.get("include") === "state")), true;
  }
  if (path === "/api/profile/onboarding" && method === "PATCH") {
    withBody(req, (b) => {
      if (b.persona !== undefined) {
        if (b.persona !== null && !ONBOARDING_PERSONAS.has(b.persona)) return problem(res, 422, "PERSONA_INVALID");
        o.persona = b.persona;
      }
      const action = b.card?.action;
      if (action === "SNOOZE") o.card.snoozedUntil = new Date(Date.now() + ONBOARDING_SNOOZE_DAYS * DAY).toISOString();
      else if (action === "DISMISS") o.card.dismissedAt = new Date().toISOString();
      else if (action === "RESET") o.card = { dismissedAt: null, snoozedUntil: null, resurfaceCount: 0 };
      else if (action !== undefined) return problem(res, 422, "DRAFT_INVALID", { path: "card.action" });
      json(res, 200, onboardingStatus(sub, false));
    });
    return true;
  }
  if (path === "/api/profile/onboarding/draft" && method === "DELETE") {
    req.resume();
    o.draft = null;
    res.writeHead(204);
    res.end();
    return true;
  }
  if (path === "/api/profile/onboarding/draft" && method === "PUT") {
    withBody(req, (b) => {
      if (b.v !== 2) return problem(res, 422, "DRAFT_INVALID", { path: "v" });
      if (!ONBOARDING_STEPS.has(b.step)) return problem(res, 422, "DRAFT_INVALID", { path: "step" });
      if (!Number.isInteger(b.stepsTotal) || b.stepsTotal < 1 || !Number.isInteger(b.stepsDone) || b.stepsDone < 0 || b.stepsDone > b.stepsTotal) return problem(res, 422, "DRAFT_INVALID", { path: "stepsDone" });
      if (!b.state || typeof b.state !== "object" || Array.isArray(b.state)) return problem(res, 422, "DRAFT_INVALID", { path: "state" });
      if (b.persona != null && !ONBOARDING_PERSONAS.has(b.persona)) return problem(res, 422, "DRAFT_INVALID", { path: "persona" });
      if (Buffer.byteLength(JSON.stringify(b.state)) > ONBOARDING_MAX_BYTES) return problem(res, 413, "DRAFT_TOO_LARGE", { max: ONBOARDING_MAX_BYTES });
      if (o.draft && b.force !== true && (!b.baseUpdatedAt || Date.parse(o.draft.updatedAt) > Date.parse(b.baseUpdatedAt))) {
        return problem(res, 409, "DRAFT_CONFLICT", { serverUpdatedAt: o.draft.updatedAt });
      }
      const hit = findSensitive(b.state, "state");
      if (hit) return problem(res, 422, "SENSITIVE_CONTENT", { path: hit, class: "SSN_ITIN" });
      if (b.persona != null) o.persona = b.persona;
      const updatedAt = onboardingNow();
      o.draft = { step: b.step, stepsDone: b.stepsDone, stepsTotal: b.stepsTotal, state: b.state, updatedAt };
      json(res, 200, { updatedAt, expiresAt: new Date(Date.now() + 30 * DAY).toISOString() });
    });
    return true;
  }
  if (path === "/api/profile/onboarding/finish" && method === "POST") {
    req.resume();
    o.finishedAt = o.finishedAt ?? new Date().toISOString();
    o.draft = null;
    const filled = Object.values(isEmptyAccount(sub) ? (EMPTY_BIOS.get(sub) ?? {}) : BIO).filter((v) => typeof v === "string" && v.trim() !== "").length;
    return json(res, 200, { finishedAt: o.finishedAt, completeness: onboardingStatus(sub, false).completeness, coverage: { fields: filled, groups: {} } }), true;
  }
  req.resume();
  json(res, 405, { error: "Method not allowed" });
  return true;
}

const server = http.createServer((req, res) => {
  const path = new URL(req.url ?? "/", "http://localhost").pathname;
  const method = req.method ?? "GET";

  if (path === "/api/public/demo") return json(res, 200, DEMO_INFO);
  // GET /api/config/public: the two public switches the web reads server-side (booleans only, same for everyone).
  if (path === "/api/config/public" && method === "GET") return json(res, 200, { orgs: ORGS_ENABLED, demo: DEMO_ENABLED, enterprise: ENTERPRISE_ENABLED });

  {
    const seen = req.headers["x-kiwiply-host"];
    if (typeof seen === "string" && path !== "/__mock/seen-hosts") seenHosts.set(path, seen);
  }
  if (path === "/__mock/seen-hosts" && method === "GET") return json(res, 200, Object.fromEntries(seenHosts));
  // GET /api/public/tenant: what the API says about the forwarded host (404 when unserved, missing header or the flag is off).
  if (path === "/api/public/tenant" && method === "GET") {
    const raw = req.headers["x-kiwiply-host"];
    const host = (typeof raw === "string" ? raw : "").split(",")[0].trim().toLowerCase().replace(/:\d+$/, "");
    if (!ENTERPRISE_ENABLED || typeof raw !== "string") return json(res, 404, { code: "NOT_FOUND", message: "error.org" });
    if (PLATFORM_MOCK_HOSTS.has(host)) return json(res, 200, { kind: "PLATFORM" });
    const tenant = MOCK_TENANTS[host];
    return tenant ? json(res, 200, tenant) : json(res, 404, { code: "NOT_FOUND", message: "error.org" });
  }

  // GET|HEAD /api/public/tenant/assets/{kind}: the published logo of the forwarded host (X2.13). Host-scoped, ETag + 304.
  {
    const m = /^\/api\/public\/tenant\/assets\/([a-z]+)$/.exec(path);
    if (m && (method === "GET" || method === "HEAD")) {
      const raw = req.headers["x-kiwiply-host"];
      const host = (typeof raw === "string" ? raw : "").split(",")[0].trim().toLowerCase().replace(/:\d+$/, "");
      const asset = ENTERPRISE_ENABLED && typeof raw === "string" ? mockTenantAsset(host, m[1]) : null;
      if (!asset) return json(res, 404, { code: "NOT_FOUND", message: "error.org" });
      const headers = { "cache-control": "public, max-age=86400", etag: asset.etag, vary: "X-Kiwiply-Host", "x-content-type-options": "nosniff" };
      if (req.headers["if-none-match"] === asset.etag) {
        res.writeHead(304, headers);
        return res.end();
      }
      res.writeHead(200, { ...headers, "content-type": asset.type, "content-length": asset.body.length });
      return res.end(method === "HEAD" ? undefined : asset.body);
    }
  }

  // GET /api/me/tenant (X2.2 contract, minimal stub for X2.6): the tid-bound member of the forwarded host and where they land.
  if (path === "/api/me/tenant" && method === "GET") {
    const host = hostOf(req);
    const key = orgKeyOf(host);
    if (!ENTERPRISE_ENABLED || !key) return json(res, 404, { code: "NOT_FOUND", message: "error.org" });
    const raw = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
    let claims = null;
    try {
      claims = JSON.parse(Buffer.from(raw.split(".")[1] ?? "", "base64url").toString());
    } catch {
      claims = null;
    }
    if (!claims || !claims.tid || claims.exp * 1000 < Date.now()) return json(res, 401, { code: "UNAUTHENTICATED", message: "error.http.401" });
    if (claims.tid !== key) return json(res, 401, { code: "TOKEN_TENANT_MISMATCH", message: "error.http.401" });
    return json(res, 200, { org: { displayName: MOCK_TENANTS[host].displayName }, member: { status: "ACTIVE" }, landing: "/w/admin", workspaces: [{ key: "admin", home: "/w/admin" }] });
  }

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
  if (path === "/api/authenticate" && method === "POST") {
    return withBody(req, (b) => {
      const who = String(b.username ?? "").trim().toLowerCase();
      // On a tenant host (X2.3): owner@<org>.com signs in on that host only; the other org's owner is a 403 NOT_A_MEMBER.
      const rawHost = req.headers["x-kiwiply-host"];
      const tenantHost = (typeof rawHost === "string" ? rawHost : "").split(",")[0].trim().toLowerCase().replace(/:\d+$/, "");
      if (MOCK_TENANTS[tenantHost]) {
        const hosts = MOCK_TENANT_USERS[who];
        if (!hosts || b.password !== MOCK_TENANT_PASSWORD) return json(res, 401, { error: "Bad credentials" });
        if (!hosts.includes(tenantHost)) return json(res, 403, { code: "NOT_A_MEMBER", message: "error.org" });
        return json(res, 200, tenantPair(who, orgKeyOf(tenantHost)));
      }
      const hit = Object.values(FIXTURE_ACCOUNTS).find((a) => a.login.toLowerCase() === who || a.email.toLowerCase() === who);
      return hit && hit.password === b.password ? json(res, 200, pair(hit.login)) : json(res, 401, { error: "Bad credentials" });
    });
  }
  if (path === "/api/refresh" && method === "POST") {
    return withBody(req, (b) => {
      const raw = String(b.refreshToken ?? "");
      // X2.6: a tenant refresh token only works on its own host (the real API answers 401 TOKEN_TENANT_MISMATCH otherwise).
      const t = /^refresh\.t\.([a-z0-9-]+)\.(.+)$/.exec(raw);
      if (t) {
        const host = hostOf(req);
        return orgKeyOf(host) === t[1] ? json(res, 200, tenantPair(t[2], t[1])) : json(res, 401, { code: "TOKEN_TENANT_MISMATCH", error: "invalid" });
      }
      const sub = raw.replace(/^refresh\./, "");
      return ACCOUNTS[sub] || MOCK_TENANT_USERS[sub] ? json(res, 200, pair(sub)) : json(res, 401, { error: "invalid" });
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
  if (handleBranding(req, res, path, method)) return;
  if (handleSources(req, res, path, method)) return;
  if (handleBuilder(req, res, path, method)) return;
  if (handleAi(req, res, path, method)) return;
  if (handleMeta(req, res, path, method)) return;
  if (handleAccess(req, res, path, method)) return;
  if (handleProfileItems(req, res, path, method)) return;
  if (handleOnboarding(req, res, path, method)) return;
  if (handleTracker(req, res, path, method)) return;
  if (handleJobs(req, res, path, method)) return;
  if (handleNotificationPrefs(req, res, path, method)) return;

  // The setup flow's profile writes (Onboarding v2 R1.10 / R1.11): `PUT /api/profile` replaces the in-memory bio, so the
  // core confirm, the per-answer question writes and the payoff's "~N fields" can be walked through without the API.
  if (path === "/api/profile" && method === "PUT") {
    const who = subOf(req);
    if (!who) {
      req.resume();
      return json(res, 401, { error: "Unauthorized" });
    }
    return withBody(req, (b) => {
      try {
        const next = JSON.parse(String(b.payload ?? "{}"));
        if (isEmptyAccount(who)) {
          EMPTY_BIOS.set(who, next);
          return json(res, 200, { payload: JSON.stringify(next) });
        }
        for (const k of Object.keys(BIO)) delete BIO[k];
        Object.assign(BIO, next);
      } catch {
        return json(res, 400, { error: "payload is not JSON" });
      }
      json(res, 200, { payload: JSON.stringify(BIO) });
    });
  }

  req.resume(); // other bodies are ignored
  const sub = subOf(req);
  if (!sub) return json(res, 401, { error: "Unauthorized" });

  // The demo switch is server config only: no endpoint flips it (reset is a POST below, refused like any write).
  if (path === "/api/admin/settings/demo" && method !== "GET" && method !== "HEAD") {
    return json(res, 405, { error: "Method not allowed: the demo switch is controlled by server config (DEMO_ENABLED)." });
  }

  // Admin AI config (I1.12): a static read-only fixture. A write gets the friendly refusal the page shows inline.
  if (path.startsWith("/api/admin/ai/") && method !== "GET" && method !== "HEAD") {
    return json(res, 403, { code: "DEMO_READ_ONLY", title: "Read-only", detail: "This is read-only in the mock demo — changes aren't saved." });
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
    if (path === "/api/admin/ai/config") return json(res, 200, aiConfigFixture());
    if (path === "/api/admin/ai/calls") return json(res, 200, aiCallsFixture(new URL(req.url ?? "/", "http://localhost").searchParams));
    if (path === "/api/admin/ai/config/history") return json(res, 200, aiHistoryFixture());
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

  // --- the demo organization (O1.8): reads only (writes were refused above); the same org the real API seeds ---
  if (path === "/api/orgs" || path.startsWith("/api/orgs/")) {
    if (!ORGS_ENABLED) return demoOrgNotFound(res);
    const role = demoOrgRole(sub);
    const org = { ...DEMO_ORG.org, billingEmail: null, settings: null };
    if (path === "/api/orgs/mine") {
      return json(res, 200, role ? [{ orgId: org.id, slug: org.slug, name: org.name, role, status: org.status, memberCount: demoOrgSeats() }] : []);
    }
    const m = /^\/api\/orgs\/(\d+)(\/groups)?$/.exec(path);
    if (!role || !m || Number(m[1]) !== org.id) return demoOrgNotFound(res);
    if (!m[2]) {
      return json(res, 200, {
        org,
        me: { memberId: role === "OWNER" ? 1 : 2, role, permissions: role === "OWNER" ? ORG_OWNER_PERMISSIONS : ORG_MEMBER_PERMISSIONS },
        memberCount: demoOrgSeats(),
        status: org.status,
      });
    }
    if (role !== "OWNER") return demoOrgNotFound(res); // listing groups needs member.view_summary
    const live = DEMO_ORG.people.filter((p) => p.status === "ACTIVE" || p.status === "INVITED"); // LIVE seats: invited, active, suspended
    return json(
      res,
      200,
      DEMO_ORG.groups.map((g) => ({
        id: g.id,
        name: g.name,
        kind: g.kind,
        sortOrder: g.sortOrder,
        memberCount: live.filter((p) => p.group === g.name).length + (DEMO_ORG.jobSeeker.group === g.name ? 1 : 0),
      })),
    );
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
    return json(res, 200, PRO ? { metered: "budget", ...aiUsage() } : { metered: "count", used: 1, limit: 3, resetsAt: ago(-20), economy: false });
  const emptyUser = isEmptyAccount(sub);
  if (path === "/api/profile") return emptyUser ? (EMPTY_BIOS.has(sub) ? json(res, 200, { payload: JSON.stringify(EMPTY_BIOS.get(sub)) }) : json(res, 404, {})) : json(res, 200, { payload: JSON.stringify(BIO) });
  // R1.6: where each saved bio value came from (the real API keeps this off GET /api/profile). The demo says "parsed" for names, "user" for the rest.
  if (path === "/api/profile/provenance")
    return json(res, 200, emptyUser ? {} : Object.fromEntries(Object.keys(BIO).filter((k) => typeof BIO[k] === "string").map((k) => [k, k === "firstName" || k === "lastName" ? "parsed" : "user"])));
  if (path === "/api/profile/resumes") return json(res, 200, emptyUser ? [] : RESUMES.map(listRow));
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

#!/usr/bin/env node
/**
 * Local demo mock of the Spring API (DEV ONLY).
 *
 * Lets you open the demo accounts on /login without MySQL or the Java API:
 *   npm run dev:demo -w web      (starts this on :8080 and `next dev` pointed at it)
 *
 * It answers just the endpoints the signed-in pages call, with realistic fixed data, and refuses every
 * write the way the real API does for a demo session (403 DEMO_READ_ONLY). Nothing is persisted.
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
};

const DEMO_INFO = {
  enabled: true,
  accounts: [
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
  ],
};

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
  { id: 1, label: "Priya Sharma - Product Designer", status: "CONFIRMED", createdAt: ago(40), defaultResume: true, starred: true, archived: false, parsedJson: resumeJson(false) },
  { id: 2, label: "Priya Sharma - Design Systems focus", status: "CONFIRMED", createdAt: ago(12), defaultResume: false, starred: false, archived: false, parsedJson: resumeJson(true) },
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

const server = http.createServer((req, res) => {
  const path = new URL(req.url ?? "/", "http://localhost").pathname;
  const method = req.method ?? "GET";

  if (path === "/api/public/demo") return json(res, 200, DEMO_INFO);

  if (path === "/api/authenticate/demo" && method === "POST") {
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

  req.resume(); // other bodies are ignored
  const sub = subOf(req);
  if (!sub) return json(res, 401, { error: "Unauthorized" });

  // The real API refuses writes from a demo session. (Reads below.)
  if (method !== "GET" && method !== "HEAD") {
    return json(res, 403, { code: "DEMO_READ_ONLY", message: "This is a demo account - changes aren't saved" });
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
  if (path === "/api/profile/resumes") return json(res, 200, RESUMES);
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

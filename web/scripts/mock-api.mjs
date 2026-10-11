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
    {
      login: "demo-admin",
      label: "App admin",
      description: "The platform admin console: users, analytics, system settings and the audit log.",
      landing: "/admin",
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
      return json(res, 200, { ...DEMO_INFO, updatedBy: "admin", updatedDate: ago(2) });
    if (path === "/api/admin/audit") {
      const events = [
        ["admin", "DEMO_SETTING_CHANGED", "app_setting", "demo.enabled", 2],
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
    if (path === "/management/health") return json(res, 200, { status: "UP", components: {} });
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

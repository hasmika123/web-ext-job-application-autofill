/**
 * The organizations half of the local demo mock (DEV ONLY; APP-E2E O1.6 / O1.7 / E2E-O4.0 / O2.1 / O2.7). Imported by
 * `mock-api.mjs`, which hands it its own helpers. In memory, like the tracker mock, and writable for NON-demo accounts;
 * it speaks the same contract as the real `OrgResource` family:
 *
 *   GET    /api/orgs/mine             [{orgId, slug, name, role, status, memberCount}] (ACTIVE seats only)
 *   POST   /api/orgs                  create a DRAFT org, caller becomes OWNER (422 ORG_INVALID, 409 SLUG_TAKEN + suggestion,
 *                                     422 ORG_LIMIT_REACHED after 3 created, 422 SENSITIVE_CONTENT)
 *   GET    /api/orgs/:id              {org, me: {memberId, role, permissions}, memberCount, status}
 *   PATCH  /api/orgs/:id              profile fields (org.settings.manage)
 *   GET/POST /api/orgs/:id/groups     (member.view_summary / groups.manage)
 *   POST   /api/orgs/:id/activate     DRAFT -> ACTIVE when MOCK_ORGS_DEV_ACTIVATE is on (default) and billing is off (OWNER)
 *   GET    /api/orgs/:id/billing      {status, billingEnabled, devActivation, subscription, items, invoices} (billing.view)
 *   GET    /api/orgs/:id/onboarding   the activation checklist (any ACTIVE member)
 *   GET    /api/orgs/:id/overview     the dashboard numbers (reports.view)
 *
 * Every id that is not the caller's answers the same generic 404 the real API does ("error.org"), never a 403. The demo
 * logins can read but not write (403 DEMO_READ_ONLY, like the rest of the mock). The demo organization is
 * `fixtures/demo-org.json`, the same table the real API seeds. Other orgs and people come from the fixtures named in
 * MOCK_FIXTURE (`fixtures/org-roles.mjs`), so a journey can sign in as an owner, a member, a person in two orgs, or nobody.
 *
 *   curl -X POST http://localhost:<MOCK_API_PORT>/mock/orgs/reset     forget every org created since the mock started
 *   MOCK_ORGS_BILLING=on     pretend Stripe is connected (the activate path then answers 404 and billing says "enabled")
 *   MOCK_ORGS_DEV_ACTIVATE=off  turn the dev activation path off
 */

const OWNER_PERMISSIONS = [
  "org.settings.manage", "org.close", "org.transfer_ownership", "members.invite", "members.import", "members.role.set", "members.remove",
  "members.suspend", "members.support_owner.set", "groups.manage", "assignments.manage", "billing.view", "billing.manage", "reports.view",
  "reports.export", "member.view_summary", "services.order_for_member", "audit.view", "integrations.manage", "ops.*", "self.share_scope.set", "self.leave",
];
/** `OrgRole.permissions()`, transcribed (declaration order of OrgPermission). */
export const ROLE_PERMISSIONS = {
  OWNER: OWNER_PERMISSIONS,
  ADMIN: OWNER_PERMISSIONS.filter((p) => p !== "org.close" && p !== "org.transfer_ownership"),
  STAFF: ["members.invite", "members.import", "reports.view", "member.view_summary", "self.share_scope.set", "self.leave"],
  MEMBER: ["ops.own_hours", "self.share_scope.set", "self.leave"],
  MARKETER: ["reports.view", "member.view_summary", "member.view_full", "member.act_for", "self.share_scope.set", "self.leave"],
  FINANCE: ["billing.view", "billing.manage", "reports.view", "reports.export", "audit.view", "ops.*", "self.share_scope.set", "self.leave"],
};

const TYPES = ["COMPANY", "SCHOOL", "BOOTCAMP", "OUTPLACEMENT", "CONSULTANCY"];
const SIZE_BANDS = ["1_50", "51_200", "201_500", "501_1000", "1001_PLUS"];
const RESERVED_SLUGS = new Set(["admin", "api", "app", "www", "join", "new", "mine", "org", "orgs", "organization", "organizations", "kiwiply", "support", "help", "login", "signup", "register", "dashboard", "settings", "billing", "status", "blog", "docs", "careers", "pricing", "demo", "demo-bootcamp"]);
const CREATED_PER_USER = 3;
const GROUPS_PER_ORG = 50;
const DEMO_LOGINS = new Set(["demo", "demo-org", "demo-admin"]);

export function deriveSlug(name) {
  let s = String(name ?? "")
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (s.length > 60) s = s.slice(0, 60).replace(/-+$/g, "");
  if (!s) return "org-team";
  if (s.length < 3) s += "-org";
  return s;
}

const wellFormed = (slug) => slug.length >= 3 && slug.length <= 60 && /^[a-z0-9](?:[a-z0-9-]{1,58})[a-z0-9]$/.test(slug) && !slug.includes("--");

export function createOrgsMock({ DEMO_ORG, orgsEnabled, json, withBody, subOf, findSensitive, fixtures = [] }) {

  let nextOrgId = 1000;
  let nextMemberId = 100;
  let nextGroupId = 100;
  /** @type {Map<number, any>} */
  const ORGS = new Map();

  const seat = (login, role, status = "ACTIVE") => ({ id: nextMemberId++, login, role, status });

  function seed() {
    ORGS.clear();
    nextOrgId = 1000;
    // ---- the demo organization (O1.8): same table the API seeds ----
    const o = DEMO_ORG.org;
    const members = [{ id: 1, login: DEMO_ORG.owner, role: "OWNER", status: "ACTIVE" }, { id: 2, login: DEMO_ORG.jobSeeker.login, role: "MEMBER", status: "ACTIVE", group: DEMO_ORG.jobSeeker.group, scope: DEMO_ORG.jobSeeker.scope }];
    DEMO_ORG.people.forEach((p, i) => members.push({ id: 3 + i, login: p.login, role: p.role, status: p.status, group: p.group, scope: p.scope }));
    ORGS.set(o.id, {
      id: o.id, slug: o.slug, name: o.name, type: o.type, status: o.status, website: null, sizeBand: o.sizeBand ?? null, country: o.country ?? null,
      timezone: o.timezone ?? "UTC", billingEmail: null, settings: null, createdAt: new Date(Date.now() - 40 * 86_400_000).toISOString(), closedAt: null,
      createdBy: DEMO_ORG.owner, demo: true, members,
      groups: DEMO_ORG.groups.map((g) => ({ id: g.id, name: g.name, kind: g.kind, sortOrder: g.sortOrder })),
      audit: [{ id: 1, at: new Date(Date.now() - 40 * 86_400_000).toISOString(), actor: DEMO_ORG.owner, role: "OWNER", action: "ORG_CREATE", details: "type=BOOTCAMP (demo seed)" }],
    });
    // ---- the fixtures' orgs ----
    for (const f of fixtures) {
      for (const o2 of f.orgs ?? []) {
        ORGS.set(o2.id, {
          id: o2.id, slug: o2.slug, name: o2.name, type: o2.type ?? "BOOTCAMP", status: o2.status ?? "ACTIVE", website: o2.website ?? null, sizeBand: o2.sizeBand ?? null,
          country: o2.country ?? null, timezone: o2.timezone ?? "UTC", billingEmail: null, settings: null, createdAt: new Date(Date.now() - 10 * 86_400_000).toISOString(), closedAt: null,
          createdBy: o2.members.find((m) => m.role === "OWNER")?.login ?? null, demo: false,
          members: o2.members.map((m) => seat(m.login, m.role, m.status ?? "ACTIVE")),
          groups: (o2.groups ?? []).map((g, i) => ({ id: nextGroupId++, name: g, kind: "COHORT", sortOrder: i })),
          audit: [],
        });
      }
    }
  }
  seed();

  // ---- helpers -----------------------------------------------------------------------------------------------------
  const notFound = (res) => (json(res, 404, { status: 404, code: "NOT_FOUND", title: "Not Found", message: "error.org" }), true);
  const problem = (res, status, code, extra = {}) => (json(res, status, { status, code, title: code, message: "error.org", ...extra }), true);
  const invalid = (res, field, message) => problem(res, 422, "ORG_INVALID", { field, message, title: `${field}: ${message}` });
  const liveSeats = (o) => o.members.filter((m) => m.status === "ACTIVE").length;
  const seatOf = (o, login) => o.members.find((m) => m.login === login && m.status === "ACTIVE" && m.role !== "COACH");
  const can = (m, key) => ROLE_PERMISSIONS[m.role]?.includes(key) ?? false;
  const audit = (o, m, action, details) => o.audit.unshift({ id: o.audit.length + 1, at: new Date().toISOString(), actor: m.login, role: m.role, action, details });

  function orgDto(o, m) {
    return {
      id: o.id, slug: o.slug, name: o.name, type: o.type, status: o.status, website: o.website, sizeBand: o.sizeBand, country: o.country, timezone: o.timezone,
      billingEmail: can(m, "billing.view") ? o.billingEmail : null,
      settings: can(m, "org.settings.manage") ? (o.settings ?? { defaultRole: "MEMBER", defaultShareScope: "SUMMARY", allowSelfLeave: true, digestDay: "DAILY", digestTime: "08:00", quietHours: { start: "21:00", end: "08:00" }, showPayToConsultant: false }) : null,
      createdAt: o.createdAt, closedAt: o.closedAt,
    };
  }
  const detail = (o, m) => ({ org: orgDto(o, m), me: { memberId: m.id, role: m.role, permissions: ROLE_PERMISSIONS[m.role] }, memberCount: liveSeats(o), status: o.status });

  /** Exposed for the later stories' handlers (billing / onboarding / overview), registered below. */
  const routes = [];
  const on = (method, pattern, perm, handler) => routes.push({ method, re: new RegExp(`^/api/orgs/(\\d+)${pattern}$`), perm, handler });

  // ---- reads/writes that exist from O1.3 --------------------------------------------------------------------------------
  function create(req, res, sub) {
    return withBody(req, (b) => {
      const name = String(b.name ?? "").trim().replace(/\s+/g, " ");
      if (!name) return invalid(res, "name", "is required");
      if (name.length > 120) return invalid(res, "name", "must be at most 120 characters");
      if (findSensitive(name, "name")) return problem(res, 422, "SENSITIVE_CONTENT", { path: "name", class: "SSN_ITIN" });
      if (b.type === "COACH") return problem(res, 422, "RESERVED_VALUE", { field: "type" });
      if (!TYPES.includes(b.type)) return invalid(res, "type", "is required");
      if ([...ORGS.values()].filter((o) => o.createdBy === sub).length >= CREATED_PER_USER) return problem(res, 422, "ORG_LIMIT_REACHED", { limit: "orgsCreatedPerUser", max: CREATED_PER_USER });
      const slug = b.slug ? String(b.slug).trim().toLowerCase() : deriveSlug(name);
      if (!wellFormed(slug)) return invalid(res, "slug", "must be 3 to 60 lower-case letters, digits or single dashes");
      const taken = (s) => RESERVED_SLUGS.has(s) || [...ORGS.values()].some((o) => o.slug === s);
      if (taken(slug)) {
        let n = 2;
        while (taken(`${slug}-${n}`)) n++;
        return problem(res, 409, "SLUG_TAKEN", { slug, suggestion: `${slug}-${n}`, title: `The address '${slug}' is taken` });
      }
      if (b.sizeBand && !SIZE_BANDS.includes(String(b.sizeBand).toUpperCase())) return invalid(res, "sizeBand", "must be one of " + SIZE_BANDS.join(", "));
      if (b.country && !/^[A-Za-z]{2}$/.test(String(b.country))) return invalid(res, "country", "must be an ISO 3166 two-letter code");
      const o = {
        id: nextOrgId++, slug, name, type: b.type, status: "DRAFT", website: null, sizeBand: b.sizeBand ? String(b.sizeBand).toUpperCase() : null,
        country: b.country ? String(b.country).toUpperCase() : null, timezone: "UTC", billingEmail: null, settings: null, createdAt: new Date().toISOString(), closedAt: null,
        createdBy: sub, demo: false, members: [], groups: [], audit: [],
      };
      const owner = seat(sub, "OWNER");
      o.members.push(owner);
      ORGS.set(o.id, o);
      audit(o, owner, "ORG_CREATE", `type=${o.type} slug=${slug}`);
      res.setHeader?.("location", `/api/orgs/${o.id}`);
      json(res, 201, detail(o, owner));
    });
  }

  function patch(req, res, o, m) {
    return withBody(req, (b) => {
      if (o.status === "CLOSED") return problem(res, 409, "ORG_NOT_EDITABLE", { title: "This organization is closed and read-only" });
      const changed = [];
      const set = (field, value) => {
        if (o[field] === value) return;
        o[field] = value;
        changed.push(field);
      };
      if (b.name != null) {
        const name = String(b.name).trim().replace(/\s+/g, " ");
        if (!name) return invalid(res, "name", "is required");
        if (name.length > 120) return invalid(res, "name", "must be at most 120 characters");
        if (findSensitive(name, "name")) return problem(res, 422, "SENSITIVE_CONTENT", { path: "name", class: "SSN_ITIN" });
        set("name", name);
      }
      if (b.website != null) {
        const w = String(b.website).trim();
        if (w && !/^https?:\/\/[^\s/]+/i.test(w)) return invalid(res, "website", "must be an http(s) address");
        set("website", w || null);
      }
      if (b.sizeBand != null) {
        const band = String(b.sizeBand).trim().toUpperCase();
        if (band && !SIZE_BANDS.includes(band)) return invalid(res, "sizeBand", "must be one of " + SIZE_BANDS.join(", "));
        set("sizeBand", band || null);
      }
      if (b.country != null) {
        const c = String(b.country).trim().toUpperCase();
        if (c && !/^[A-Z]{2}$/.test(c)) return invalid(res, "country", "must be an ISO 3166 two-letter code");
        set("country", c || null);
      }
      if (b.timezone != null) {
        try {
          new Intl.DateTimeFormat("en", { timeZone: String(b.timezone) });
        } catch {
          return invalid(res, "timezone", "must be an IANA time zone such as America/New_York");
        }
        set("timezone", String(b.timezone));
      }
      if (changed.length) audit(o, m, "ORG_SETTINGS", `fields=${changed.join(",")}`);
      json(res, 200, detail(o, m));
    });
  }

  function groupsList(res, o) {
    json(res, 200, o.groups.map((g) => ({ ...g, memberCount: o.members.filter((x) => x.group === g.name && ["ACTIVE", "INVITED", "SUSPENDED"].includes(x.status)).length })));
  }

  function groupsCreate(req, res, o, m) {
    return withBody(req, (b) => {
      const name = String(b.name ?? "").trim().replace(/\s+/g, " ");
      if (!name) return invalid(res, "name", "is required");
      if (name.length > 80) return invalid(res, "name", "must be at most 80 characters");
      if (findSensitive(name, "name")) return problem(res, 422, "SENSITIVE_CONTENT", { path: "name", class: "SSN_ITIN" });
      if (o.groups.some((g) => g.name.toLowerCase() === name.toLowerCase())) return problem(res, 409, "GROUP_NAME_TAKEN", { name });
      if (o.groups.length >= GROUPS_PER_ORG) return problem(res, 422, "ORG_LIMIT_REACHED", { limit: "groupsPerOrg", max: GROUPS_PER_ORG });
      const g = { id: nextGroupId++, name, kind: ["DEPARTMENT", "COHORT", "TEAM"].includes(b.kind) ? b.kind : "TEAM", sortOrder: Number(b.sortOrder) || o.groups.length };
      o.groups.push(g);
      audit(o, m, "GROUP_CREATE", `name=${name} kind=${g.kind}`);
      json(res, 201, { ...g, memberCount: 0 });
    });
  }

  function groupsDelete(res, o, m, groupId) {
    const i = o.groups.findIndex((g) => g.id === groupId);
    if (i < 0) return notFound(res);
    const [g] = o.groups.splice(i, 1);
    o.members.forEach((x) => x.group === g.name && delete x.group);
    audit(o, m, "GROUP_DELETE", `name=${g.name}`);
    res.writeHead(204);
    res.end();
    return true;
  }

  // ---- the routes under /api/orgs/:id/... (permission key, or null = any ACTIVE member) ---------------------------------
  on("GET", "/groups", "member.view_summary", (req, res, o) => groupsList(res, o));
  on("POST", "/groups", "groups.manage", (req, res, o, m) => groupsCreate(req, res, o, m));
  on("DELETE", "/groups/(\\d+)", "groups.manage", (req, res, o, m, match) => groupsDelete(res, o, m, Number(match[2])));

  /** Answers 200 with `body` and reports "handled". */
  const ok = (res, body, status = 200) => {
    json(res, status, body);
    return true;
  };

  // ---- billing-off activation (E2E-O4.0) ----------------------------------------------------------------------------
  // MOCK_ORGS_BILLING=on pretends Stripe is connected; MOCK_ORGS_DEV_ACTIVATE=off closes the dev path (like production).
  const billingOn = /^(on|true|1|yes)$/i.test(process.env.MOCK_ORGS_BILLING ?? "off");
  const devActivate = !/^(false|0|no|off)$/i.test(process.env.MOCK_ORGS_DEV_ACTIVATE ?? "on");
  const activatable = (o) => o.status === "DRAFT" || o.status === "PENDING_SETUP_FEE";
  on("GET", "/billing", "billing.view", (req, res, o, m) =>
    ok(res, { status: o.status, billingEnabled: billingOn, devActivation: devActivate && !billingOn && m.role === "OWNER" && activatable(o), subscription: null, items: [], invoices: [] }),
  );
  on("POST", "/activate", "billing.manage", (req, res, o, m) => {
    if (!devActivate || billingOn || m.role !== "OWNER") return notFound(res);
    if (o.status === "ACTIVE") return ok(res, detail(o, m));
    if (!activatable(o)) return problem(res, 409, "ORG_NOT_EDITABLE", { title: "This organization can't be activated from its current state" });
    o.status = "ACTIVE";
    audit(o, m, "BILLING_DEV_ACTIVATED", `status DRAFT -> ACTIVE (billing off)`);
    return ok(res, detail(o, m));
  });

  // ---- the dashboard: checklist + overview (O2.7) -------------------------------------------------------------------
  const count = (o, role, status) => o.members.filter((m) => m.role === role && m.status === status).length;
  on("GET", "/onboarding", "org.settings.manage", (req, res, o) => {
    const admins = count(o, "ADMIN", "ACTIVE");
    const adminsInvited = count(o, "ADMIN", "INVITED");
    const people = count(o, "MEMBER", "ACTIVE");
    const peopleInvited = count(o, "MEMBER", "INVITED");
    const row = (key, done, c = null, total = null, href = "/org", optional = false) => ({ key, done, count: c, total, href, available: key === "activate" || key === "groups", optional });
    const items = [
      row("activate", o.status === "ACTIVE" || o.status === "PAST_DUE", null, null, "/org/billing"),
      row("groups", o.groups.length >= 1, o.groups.length),
      row("profile", !!o.website, null, null, "/org/settings"),
      row("admins", admins >= 1, admins, admins + adminsInvited, "/org/team"),
      row("invite", people >= 1, people, people + peopleInvited, "/org/team"),
      row("plans", false, null, null, "/org/billing"),
      row("owners", false, null, null, "/org/team"),
      row("domain", false, 0, null, "/org/settings", true),
    ];
    const required = items.filter((i) => !i.optional);
    const done = required.filter((i) => i.done).length;
    return ok(res, { items, done, total: required.length, complete: done === required.length });
  });

  /** The demo org's applications, derived like DemoOrgSeeder's (2 to 6 per active member, statuses cycling) so the mock dashboard has the same shape as the real stack's. */
  const PIPE = ["APPLIED", "IN_REVIEW", "INTERVIEW", "OFFER", "REJECTED"];
  const SEED_STATUSES = ["APPLIED", "SAVED", "INTERVIEW", "APPLIED", "REJECTED", "OFFER", "DRAFT"];
  function demoApplications(o) {
    const counts = Object.fromEntries(PIPE.map((s) => [s, 0]));
    let submitted30d = 0;
    let placed = 0;
    let index = 0;
    for (const m of o.members) {
      if (m.role !== "MEMBER" || m.status !== "ACTIVE" || m.login === DEMO_ORG.jobSeeker.login) continue;
      const shares = m.scope === "SUMMARY" || m.scope === "FULL";
      const n = 2 + ((index * 3) % 5);
      let accepted = false;
      for (let i = 0; i < n && shares; i++) {
        const status = SEED_STATUSES[(index + i) % SEED_STATUSES.length];
        if (status in counts) counts[status]++;
        if (status !== "SAVED" && status !== "DRAFT" && 4 + i * 5 + index - 1 <= 30) submitted30d++;
        if (status === "OFFER" && (index + i) % 2 === 0) accepted = true;
      }
      if (accepted) placed++;
      index++;
    }
    return { counts, submitted30d, placed };
  }
  on("GET", "/overview", "reports.view", (req, res, o, m) => {
    const sharing = o.members.filter((x) => x.role === "MEMBER" && x.status === "ACTIVE" && (x.scope === "SUMMARY" || x.scope === "FULL")).length;
    const apps = o.demo && sharing > 0 && (m.role === "OWNER" || m.role === "ADMIN" || m.role === "FINANCE") ? demoApplications(o) : { counts: Object.fromEntries(PIPE.map((s) => [s, 0])), submitted30d: 0, placed: 0 };
    const seats = o.members.filter((x) => ["ACTIVE", "INVITED", "SUSPENDED"].includes(x.status)).length;
    const mayAudit = can(m, "audit.view");
    const finance = m.role === "FINANCE";
    const recent = (mayAudit ? o.audit : [])
      .filter((e) => !finance || /^(BILLING_|OPS_)/.test(e.action))
      .slice(0, 8)
      .map((e) => ({ id: e.id, at: e.at, action: e.action, targetType: "ORG", mine: e.actor === m.login }));
    return ok(res, {
      seats: { total: seats, active: liveSeats(o), invited: count(o, "MEMBER", "INVITED") + count(o, "ADMIN", "INVITED") + count(o, "STAFF", "INVITED"), sharing: ["OWNER", "ADMIN", "FINANCE"].includes(m.role) ? sharing : 0 },
      groups: o.groups.length,
      applications: {
        submitted30d: apps.submitted30d,
        interviewing: apps.counts.INTERVIEW,
        offers: apps.counts.OFFER,
        placedMembers: apps.placed,
        upcomingInterviews: 0,
        pipeline: PIPE.map((s) => ({ stage: s, count: apps.counts[s] })),
      },
      recent,
    });
  });

  /** The request handler: true when it answered. */
  return function handleOrgs(req, res, path, method) {
    if (path === "/mock/orgs/reset" && method === "POST") {
      req.resume();
      seed();
      return ok(res, { ok: true });
    }
    if (path !== "/api/orgs" && !path.startsWith("/api/orgs/")) return false;

    const sub = subOf(req);
    if (!orgsEnabled) {
      req.resume();
      return notFound(res);
    }
    if (!sub) {
      req.resume();
      return ok(res, { error: "Unauthorized" }, 401);
    }
    const write = method !== "GET" && method !== "HEAD";
    if (write && DEMO_LOGINS.has(sub)) {
      req.resume();
      return ok(res, { code: "DEMO_READ_ONLY", message: "This is a demo account - changes aren't saved" }, 403);
    }

    if (path === "/api/orgs" && method === "POST") {
      create(req, res, sub);
      return true;
    }
    if (path === "/api/orgs/mine" && method === "GET") {
      req.resume();
      const rows = [...ORGS.values()]
        .map((o) => ({ o, m: seatOf(o, sub) }))
        .filter((x) => x.m)
        .map(({ o, m }) => ({ orgId: o.id, slug: o.slug, name: o.name, role: m.role, status: o.status, memberCount: liveSeats(o) }))
        .sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));
      return ok(res, rows);
    }

    const base = /^\/api\/orgs\/(\d+)$/.exec(path);
    if (base) {
      const o = ORGS.get(Number(base[1]));
      const m = o && seatOf(o, sub);
      if (!m || (method !== "GET" && method !== "PATCH") || (method === "PATCH" && !can(m, "org.settings.manage"))) {
        req.resume();
        return notFound(res);
      }
      if (method === "GET") {
        req.resume();
        return ok(res, detail(o, m));
      }
      patch(req, res, o, m);
      return true;
    }

    for (const r of routes) {
      const match = r.re.exec(path);
      if (!match || r.method !== method) continue;
      const o = ORGS.get(Number(match[1]));
      const m = o && seatOf(o, sub);
      if (!m || (r.perm && !can(m, r.perm))) {
        req.resume();
        return notFound(res);
      }
      if (!write) req.resume();
      r.handler(req, res, o, m, match);
      return true;
    }
    req.resume();
    return notFound(res);
  };
}

export { OWNER_PERMISSIONS };

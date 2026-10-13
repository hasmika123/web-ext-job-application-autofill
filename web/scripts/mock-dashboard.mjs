/**
 * The Organization Dashboard API mock (X2.17), in memory, DEV ONLY. It answers the two routes of `OrgDashboardResource` (X2.4):
 *   GET  /api/orgs/{orgId}/dashboard
 *   POST /api/orgs/{orgId}/dashboard/alerts/{alertKey}/dismiss     (hides the alert for that caller; the real API: 7 days)
 * with the contract's exact shape: `{orgId, generatedAt, widgets:[{key, state, reason?, module?, data?}]}` in board order.
 * The four tiles and two charts whose modules are not built are `unavailable / NOT_ENABLED` with no data, exactly like the
 * real API today. A caller who is not a member of that org gets the API's 404; a member without `dashboard.view_org` also 404.
 *
 * Seeds: acme (id 2) mirrors the demo org (consultants 2: one invited, one suspended; employees 7; nine audit rows); beta (id 3)
 * has one member. Testing hooks: POST /mock/dashboard/reset, POST /mock/dashboard/fail?on=1|0 (the next GETs answer 500),
 * POST /mock/dashboard/error-widget?key=activity.recent (that widget answers `error` until reset).
 */

const ORGS = {
  2: { name: "Acme", members: new Set(["owner@acme.com", "sarah@acme.com"]) },
  3: { name: "Beta Talent", members: new Set(["owner@beta.com"]) },
};

const NOW = () => new Date();
const ago = (ms) => new Date(Date.now() - ms).toISOString();
const H = 3600e3;
const D = 24 * H;

const NOT_ENABLED = (key, module) => ({ key, state: "unavailable", reason: "NOT_ENABLED", module });

const QUICK = [
  { key: "invite-employee", label: "Invite Employee", description: "Add a new team member", href: "/w/admin/employees?invite=1", permission: "members.invite", available: true, soonModule: null },
  { key: "assign-marketer", label: "Assign Marketer", description: "Connect a marketer to consultants", href: "/w/admin/assignments", permission: "assignments.manage", available: false, soonModule: "marketing" },
  { key: "configure-licenses", label: "Configure Licenses", description: "Manage seats and features", href: "/w/admin/licenses", permission: "licenses.manage", available: false, soonModule: "billing" },
  { key: "review-applications", label: "Review Applications", description: "View pending applications", href: "/w/admin/applications", permission: "member.view_summary", available: false, soonModule: "applications" },
  { key: "view-pipeline", label: "View Pipeline", description: "See applications by stage", href: "/w/admin/pipeline", permission: "pipeline.view", available: false, soonModule: "applications" },
  { key: "configure-organization", label: "Configure Organization", description: "Settings and defaults", href: "/w/admin/settings", permission: "org.settings.manage", available: false, soonModule: "settings" },
];

const ACME_ACTIVITY = [
  { id: 9, action: "BRANDING_PUBLISH", label: "published the branding", actorLogin: "demo-ent-acme-sarah", actorName: "Sarah Chen", targetType: null, targetLogin: null, targetName: null, at: ago(2 * H) },
  { id: 8, action: "ASSIGNMENT_CREATE", label: "assigned a consultant", actorLogin: "demo-ent-acme-sarah", actorName: "Sarah Chen", targetType: "MEMBER", targetLogin: "demo-ent-acme-anika", targetName: "Anika Rao", at: ago(5 * H) },
  { id: 7, action: "MEMBER_INVITE", label: "invited a member", actorLogin: "demo-ent-acme-sarah", actorName: "Sarah Chen", targetType: "MEMBER", targetLogin: null, targetName: null, at: ago(1 * D + 2 * H) },
  { id: 6, action: "ROLE_ASSIGN", label: "assigned a role", actorLogin: "demo-ent-acme-sarah", actorName: "Sarah Chen", targetType: "MEMBER", targetLogin: "demo-ent-acme-omar", targetName: "Omar Haddad", at: ago(2 * D) },
  { id: 5, action: "MEMBER_SUSPEND", label: "suspended or reinstated a member", actorLogin: "demo-ent-acme-sarah", actorName: "Sarah Chen", targetType: "MEMBER", targetLogin: "demo-ent-acme-sam", targetName: "Sam Whitfield", at: ago(3 * D) },
  { id: 4, action: "ORG_SETTINGS", label: "changed the organization settings", actorLogin: "demo-ent-acme-sarah", actorName: "Sarah Chen", targetType: null, targetLogin: null, targetName: null, at: ago(5 * D) },
];

const BETA_ACTIVITY = [{ id: 2, action: "ORG_CREATE", label: "created the organization", actorLogin: "demo-ent-beta-bea", actorName: "Bea Turner", targetType: null, targetLogin: null, targetName: null, at: ago(6 * D) }];

const tile = (value, previous, spark, counts) => ({
  value,
  previous,
  deltaPct: previous > 0 ? Math.round(((value - previous) * 1000) / previous) / 10 : null,
  sparkline: spark,
  comparedTo: "30d",
  counts,
});

const ACME_ALERTS = [
  { key: "INVITES_EXPIRING", severity: "warn", title: "1 invitation expires within 48 hours", message: "Resend it so the person can still join.", href: "/w/admin/employees?status=invited", count: 1 },
  { key: "MEMBERS_SUSPENDED", severity: "info", title: "1 member is suspended", message: "They cannot sign in until you reinstate them.", href: "/w/admin/employees?status=suspended", count: 1 },
];

function widgetsFor(orgId, login, s) {
  const acme = orgId === 2;
  const failing = (key) => s.errorWidgets.has(key);
  const consultants = acme
    ? { key: "consultants.total", state: "ok", data: tile(2, 1, [0, 0, 1, 1, 1, 1, 2, 2], { active: 0, invited: 1, suspended: 1 }) }
    : { key: "consultants.total", state: "empty", reason: "NO_CONSULTANTS" };
  const employees = acme
    ? { key: "employees.active", state: "ok", data: tile(7, 7, [5, 5, 6, 6, 7, 7, 7, 7], { active: 7, invited: 1 }) }
    : { key: "employees.active", state: "ok", data: tile(1, 0, [0, 0, 0, 1, 1, 1, 1, 1], { active: 1, invited: 0 }) };
  const dismissed = s.dismissed.get(login) ?? new Set();
  const alerts = (acme ? ACME_ALERTS : []).filter((a) => !dismissed.has(a.key));
  const activity = acme ? ACME_ACTIVITY : BETA_ACTIVITY;
  const out = [
    consultants,
    employees,
    NOT_ENABLED("applications.active", "applications"),
    NOT_ENABLED("interviews.upcoming", "interviews"),
    NOT_ENABLED("placements", "placements"),
    NOT_ENABLED("finance.summary", "hrFinance"),
    NOT_ENABLED("team.performance", "analytics"),
    NOT_ENABLED("pipeline.overview", "applications"),
    { key: "quick.actions", state: "ok", data: { items: QUICK } },
    alerts.length ? { key: "alerts", state: "ok", data: { items: alerts } } : { key: "alerts", state: "empty", reason: "NO_ALERTS" },
    acme ? { key: "invites.pending", state: "ok", data: { invited: 1, expiringSoon: 1, suspended: 1 } } : { key: "invites.pending", state: "empty", reason: "NOTHING_PENDING" },
    { key: "activity.recent", state: "ok", data: { items: activity } },
    { key: "subscription.summary", state: "ok", data: { orgStatus: "ACTIVE", setupFeePaidAt: ago(30 * D) } },
  ];
  return out.map((w) => (failing(w.key) ? { key: w.key, state: "error", reason: "PROVIDER_FAILED" } : w));
}

export function createDashboardMock({ json, subOf = () => null }) {
  const fresh = () => ({ dismissed: new Map(), errorWidgets: new Set(), fail: false });
  let state = fresh();

  return function handle(req, res, path, method) {
    if (path === "/mock/dashboard/reset" && method === "POST") {
      req.resume();
      state = fresh();
      return json(res, 200, { ok: true }), true;
    }
    if (path === "/mock/dashboard/fail" && method === "POST") {
      req.resume();
      state.fail = new URL(req.url, "http://mock").searchParams.get("on") !== "0";
      return json(res, 200, { fail: state.fail }), true;
    }
    if (path === "/mock/dashboard/error-widget" && method === "POST") {
      req.resume();
      state.errorWidgets.add(new URL(req.url, "http://mock").searchParams.get("key") ?? "");
      return json(res, 200, { ok: true }), true;
    }
    const m = /^\/api\/orgs\/(\d+)\/dashboard(\/alerts\/([A-Z0-9_]+)\/dismiss)?$/.exec(path);
    if (!m) return false;
    req.resume();
    const orgId = Number(m[1]);
    const login = subOf(req);
    const org = ORGS[orgId];
    if (!org || !login || !org.members.has(login)) return json(res, 404, { status: 404, code: "NOT_FOUND", message: "error.org" }), true;
    if (m[2]) {
      if (method !== "POST") return json(res, 405, { status: 405 }), true;
      if (orgId !== 2 || !ACME_ALERTS.some((a) => a.key === m[3])) return json(res, 404, { status: 404, code: "NOT_FOUND" }), true;
      const set = state.dismissed.get(login) ?? new Set();
      set.add(m[3]);
      state.dismissed.set(login, set);
      return json(res, 200, { key: m[3], until: new Date(Date.now() + 7 * D).toISOString() }), true;
    }
    if (method !== "GET") return json(res, 405, { status: 405 }), true;
    if (state.fail) return json(res, 500, { status: 500, title: "Internal Server Error" }), true;
    return json(res, 200, { orgId, generatedAt: NOW().toISOString(), widgets: widgetsFor(orgId, login, state) }), true;
  };
}

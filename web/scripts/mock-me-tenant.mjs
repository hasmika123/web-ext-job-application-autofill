// GET /api/me/tenant for the mock API (X2.2; DEV ONLY). It answers like MeTenantResource: the workspace definitions are the API's own
// resource (api/src/main/resources/config/ent/workspaces.json, read straight from the repo, so the mock can not drift from it) and
// each page is filtered by the member's permissions and the organization's modules. The permission lists below are the real
// role templates (RoleTemplates.java) for the roles the mock signs in: change a template and the API's tests tell you; keep these in step.
//
// Members (password demo1234; see MOCK_TENANT_USERS in mock-tenants.mjs):
//   acme.localhost: owner@acme.com (OWNER) - marketer@acme.com (MARKETING_SPECIALIST) - sarah@acme.com (ORG_ADMIN + MARKETING_MANAGER)
//                   consultant@acme.com (CONSULTANT) - finance@acme.com (FINANCE_SPECIALIST) - paused@acme.com (suspended)
//   beta.localhost: owner@beta.com (OWNER)
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { demoPeople } from "./fixtures/enterprise.mjs";

const DEFS_PATH = "api/src/main/resources/config/ent/workspaces.json";
function loadDefs() {
  try {
    return JSON.parse(readFileSync(new URL(`../../${DEFS_PATH}`, import.meta.url), "utf8"));
  } catch {
    // a bundler (vitest) rewrites import.meta.url: fall back to the working directory (web/ or the repo root)
    for (const base of ["..", "."]) {
      try {
        return JSON.parse(readFileSync(resolve(process.cwd(), base, DEFS_PATH), "utf8"));
      } catch {
        /* try the next */
      }
    }
    throw new Error(`mock-me-tenant: cannot read ${DEFS_PATH}`);
  }
}
const DEFS = loadDefs();

const ADMIN = ["org.settings.manage", "branding.manage", "domains.manage", "roles.manage", "members.invite", "members.import", "members.role.set", "members.remove", "members.suspend", "members.support_owner.set", "members.group.set", "members.manager.set", "groups.manage", "assignments.manage", "consultants.view", "consultants.edit", "resumes.view_for", "resumes.approve_request", "licenses.view", "licenses.manage", "billing.view", "billing.manage", "usage.view", "pipeline.view", "clients.view", "placements.view", "hr.view", "finance.view", "reports.view", "reports.export", "audit.view", "integrations.manage", "dashboard.view_org", "member.view_summary", "services.order_for_member", "ops.*", "self.share_scope.set", "self.leave"];
const at = (scope, keys) => Object.fromEntries(keys.map((k) => [k, scope]));
const MARKETING = ["member.view_summary", "member.view_full", "member.act_for", "consultants.view", "resumes.view_for", "resumes.edit_for", "opportunities.manage", "matches.run", "submissions.prepare", "submissions.record", "followups.manage", "interviews.coordinate", "pipeline.view", "reports.view"];
const SELF = ["self.share_scope.set", "self.leave"];

const ROLES = {
  OWNER: { name: "Owner", workspace: "ADMIN", grants: at("ORG", [...ADMIN, "org.close", "org.transfer_ownership"]) },
  ORG_ADMIN: { name: "Organization Admin", workspace: "ADMIN", grants: at("ORG", ADMIN) },
  MARKETING_SPECIALIST: { name: "Marketing Specialist", workspace: "MARKETING", grants: { ...at("ASSIGNED", MARKETING), ...at("OWN", SELF) } },
  MARKETING_MANAGER: {
    name: "Marketing Manager",
    workspace: "MARKETING_MGMT",
    grants: { ...at("TEAM", [...MARKETING, "assignments.manage", "approvals.decide", "workload.view", "escalations.manage", "reports.export", "members.manager.set"]), ...at("OWN", SELF) },
  },
  CONSULTANT: { name: "Consultant", workspace: "CONSULTANT", grants: at("OWN", ["opportunities.respond", "submissions.authorize", "applications.manage", "interviews.manage", "offers.respond", "resumes.manage", "features.view", ...SELF]) },
  // X1.12: the templates the enterprise demo roster uses beyond the six above (RoleTemplates.java)
  HR_SPECIALIST: { name: "HR Specialist", workspace: "HR", grants: { ...at("ORG", ["members.invite", "members.suspend", "members.group.set", "members.manager.set", "hr.view", "hr.manage", "groups.manage", "lifecycle.manage", "reports.view"]), ...at("OWN", SELF) } },
  ACCOUNT_MANAGER: { name: "Account Manager", workspace: "ACCOUNTS", grants: { ...at("ORG", ["clients.view", "clients.manage", "requirements.manage", "submissions.record", "interviews.coordinate", "offers.manage", "placements.manage", "reports.view"]), ...at("OWN", SELF) } },
  TALENT_ACQUISITION: { name: "Talent Acquisition", workspace: "HR", grants: { ...at("ORG", ["members.invite", "candidates.manage", "talent_pools.manage", "consultants.view", "onboarding.coordinate"]), ...at("OWN", SELF) } },
  EXECUTIVE_VIEWER: { name: "Executive Viewer", workspace: "EXEC", grants: { ...at("ORG", ["dashboard.view_org", "reports.view", "pipeline.view", "billing.view"]), ...at("OWN", SELF) } },
  FINANCE_SPECIALIST: { name: "Finance Specialist", workspace: "FINANCE", grants: at("ORG", ["billing.view", "billing.manage", "licenses.view", "usage.view", "finance.view", "finance.manage", "placements.view", "ops.*", "reports.view", "reports.export", "audit.view", ...SELF]) },
};

const ROLE_ID = Object.fromEntries(Object.keys(ROLES).map((k, i) => [k, i + 1]));

/** host -> login -> { roles: [primary, ...], status, landingPref? } */
const MEMBERS = {
  "acme.localhost": {
    "owner@acme.com": { name: "Olivia Owner", roles: ["OWNER"], status: "ACTIVE", id: 101 },
    "marketer@acme.com": { name: "Mia Marketer", roles: ["MARKETING_SPECIALIST"], status: "ACTIVE", id: 102 },
    "sarah@acme.com": { name: "Sarah Singh", roles: ["ORG_ADMIN", "MARKETING_MANAGER"], status: "ACTIVE", id: 103 },
    "consultant@acme.com": { name: "Anika Rao", roles: ["CONSULTANT"], status: "ACTIVE", id: 104 },
    "finance@acme.com": { name: "Felix Finance", roles: ["FINANCE_SPECIALIST"], status: "ACTIVE", id: 105 },
    "paused@acme.com": { name: "Pat Paused", roles: ["ORG_ADMIN"], status: "SUSPENDED", id: 106 },
  },
  "beta.localhost": {
    "owner@beta.com": { name: "Bea Owner", roles: ["OWNER"], status: "ACTIVE", id: 201 },
  },
};
// X1.12: the enterprise demo members (fixtures/enterprise-demo.json, the roster the real API seeds) sign in through the demo tab.
let demoId = 300;
for (const host of Object.keys(MEMBERS)) {
  for (const p of demoPeople(host)) {
    if (p.login) MEMBERS[host][p.login] = { name: p.name, roles: p.roles, status: p.status, id: ++demoId };
  }
}
/** The role names of a template key, as the API prints them (the demo tab's labels). */
export const roleName = (key) => ROLES[key]?.name ?? key;
/** True when `login` holds an ACTIVE seat on `host` (the demo login's membership check). */
export const memberStatus = (host, login) => MEMBERS[host]?.[login]?.status ?? null;
// acme.id is the one mock-branding.mjs serves (ACME_ORG_ID): the Branding page takes its organization from this session.
const ORGS = {
  "acme.localhost": { id: 2, displayName: "Acme", type: "STAFFING", terminology: {} },
  "beta.localhost": { id: 3, displayName: "Beta Talent", type: "STAFFING", terminology: { employees: "Team members" } },
};

/** Modules per host: marketing and billing on for Acme so the role menus have something to show; Beta has none. */
const MODULES = {
  "acme.localhost": { domains: true, roles: true, billing: true, marketing: true, hrFinance: false, extensionWorkspaces: false, integrations: false, analytics: false },
  "beta.localhost": { domains: false, roles: false, billing: false, marketing: false, hrFinance: false, extensionWorkspaces: false, integrations: false, analytics: false },
};

const jwtSub = (req) => {
  try {
    return JSON.parse(Buffer.from((req.headers.authorization ?? "").replace(/^Bearer\s+/i, "").split(".")[1] ?? "", "base64url").toString()).sub ?? null;
  } catch {
    return null;
  }
};

/** Pure: the contract for one member on one host (exported for tests). */
export function meTenantFor(host, login) {
  const org = ORGS[host];
  const member = MEMBERS[host]?.[login];
  if (!org || !member) return null;
  const mods = MODULES[host];
  const grants = {};
  const roleViews = member.roles.map((key, i) => {
    for (const [k, scope] of Object.entries(ROLES[key].grants)) {
      const order = ["OWN", "ASSIGNED", "TEAM", "DEPARTMENT", "ORG"];
      if (!grants[k] || order.indexOf(scope) > order.indexOf(grants[k])) grants[k] = scope;
    }
    return { id: ROLE_ID[key], key, name: ROLES[key].name, isPrimary: i === 0, workspaceKey: ROLES[key].workspace };
  });
  const held = (needs) => needs.length === 0 || needs.some((k) => grants[k]);
  const workspaces = [];
  for (const def of [...DEFS.workspaces].sort((a, b) => a.order - b.order)) {
    const via = roleViews.filter((r) => r.workspaceKey === def.key).map((r) => r.key);
    if (!via.length) continue;
    const nav = def.nav.filter((n) => (!n.module || mods[n.module]) && held(n.needs));
    if (!nav.length || nav[0].key !== "home") continue;
    const items = nav.map(({ key, label, icon, href, badge }) => ({ key, label, icon, href, badge: badge ?? null }));
    workspaces.push({
      key: def.slug,
      workspaceKey: def.key,
      label: def.label,
      home: def.home,
      order: def.order,
      roleKeys: via,
      nav: items,
      bottomTabs: def.bottomTabs.filter((t) => items.some((n) => n.key === t)),
    });
  }
  const primaryWs = roleViews[0].workspaceKey;
  const landingWs = workspaces.find((w) => w.workspaceKey === primaryWs) ?? workspaces[0] ?? null;
  const body = {
    org: { id: org.id, displayName: org.displayName, status: "ACTIVE", type: org.type, primaryHost: host, terminology: org.terminology ?? {}, flags: { pastDue: false, billingActionRequired: false, greeting: true } },
    member: { id: member.id, status: member.status, title: null, departmentGroupId: null, teamGroupId: null, managerMemberId: null, joinedAt: "2026-10-01T09:00:00Z" },
    person: { name: member.name, email: login, imageUrl: null },
    roles: roleViews,
    permissions: Object.fromEntries(Object.entries(grants).sort(([a], [b]) => a.localeCompare(b))),
    modules: mods,
    workspaces,
    landing: landingWs?.home ?? null,
    landingKey: landingWs?.key ?? null,
    consent: { scope: "NONE", fullTo: null },
    features: { licensed: [], pending: true },
  };
  const etag = `"${createHash("sha256").update(JSON.stringify([roleViews.map((r) => r.key), body.permissions, mods, workspaces.map((w) => [w.key, w.nav.map((n) => n.key)]), body.landing])).digest("hex").slice(0, 24)}"`;
  return { body, etag, suspended: member.status === "SUSPENDED" };
}

/** Returns true when it answered. Plug in before the demo-account auth gate (tenant sign-ins are not demo accounts). */
export function handleMeTenant(req, res, path, method, json, tenantHostOf) {
  if (path !== "/api/me/tenant" || method !== "GET") return false;
  const host = tenantHostOf(req);
  if (!host || !ORGS[host]) return json(res, 404, { status: 404, code: "NOT_FOUND", message: "error.org" }), true;
  const login = jwtSub(req);
  if (!login) return json(res, 401, { status: 401, code: "TOKEN_TENANT_REQUIRED" }), true;
  if (!MEMBERS[host]?.[login]) {
    // signed in somewhere else (another tenant's member, or a personal account): not this tenant's session
    const elsewhere = Object.values(MEMBERS).some((m) => m[login]);
    return elsewhere ? (json(res, 401, { status: 401, code: "TOKEN_TENANT_MISMATCH" }), true) : (json(res, 404, { status: 404, code: "NOT_FOUND", message: "error.org" }), true);
  }
  const answer = meTenantFor(host, login);
  if (answer.suspended) return json(res, 403, { status: 403, code: "MEMBER_SUSPENDED", message: "Your access to this workspace is paused" }), true;
  if (req.headers["if-none-match"] === answer.etag) {
    res.writeHead(304, { etag: answer.etag, "cache-control": "private, no-cache" });
    res.end();
    return true;
  }
  res.writeHead(200, { "content-type": "application/json", etag: answer.etag, "cache-control": "private, no-cache" });
  res.end(JSON.stringify(answer.body));
  return true;
}

// ---- the shell bell (X2.16) ---------------------------------------------------------------------------------------------------
// GET /api/profile/notifications and POST .../read-all for a tenant member's token. Admin-side members (owner, Sarah) have a few
// unread notices so the bell shows its dot; everyone else is caught up. Read state is per process (a restart resets it).
const READ = new Set();
const NOTICES = (login) => [
  { id: 1, title: "3 invitations are waiting", body: "People you invited have not accepted yet.", link: "/w/admin/employees?status=invited", createdAt: "2026-10-13T08:30:00Z", read: READ.has(login) },
  { id: 2, title: "Branding draft saved", body: "Publish it when you are ready.", link: "/w/admin/branding", createdAt: "2026-10-12T16:10:00Z", read: READ.has(login) },
];
const WITH_NOTICES = new Set(["owner@acme.com", "sarah@acme.com"]);

export function handleTenantNotifications(req, res, path, method, json) {
  if (path !== "/api/profile/notifications" && path !== "/api/profile/notifications/read-all") return false;
  const login = jwtSub(req);
  const isTenantMember = login && Object.values(MEMBERS).some((m) => m[login]);
  if (!isTenantMember) return false; // a personal account: the regular mock answers
  if (path.endsWith("/read-all") && method === "POST") return READ.add(login), json(res, 200, { ok: true }), true;
  if (method !== "GET") return false;
  const items = WITH_NOTICES.has(login) ? NOTICES(login) : [];
  return json(res, 200, { unread: items.filter((n) => !n.read).length, items }), true;
}

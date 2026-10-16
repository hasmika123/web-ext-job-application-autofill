/**
 * The Roles & Permissions API mock (X4.11), in memory, DEV ONLY. It answers the routes of OrgRoleResource (X1.14 + X4.1) and
 * OrgPermissionCatalogResource for the tenant members scripts/mock-me-tenant.mjs signs in (acme.localhost: owner@acme.com,
 * sarah@acme.com, ...; beta.localhost: owner@beta.com, and the enterprise demo roster):
 *
 *   GET  /api/orgs/{o}/roles/overview        the table, counts and the permission donut
 *   GET  /api/orgs/{o}/roles/{id}            one role + ETag-style `version`
 *   POST /api/orgs/{o}/roles                 blank / template / copy, 422 ROLE_CEILING, 409 ROLE_NAME_TAKEN
 *   PATCH/DELETE /api/orgs/{o}/roles/{id}    If-Match (428 / 412 PRECONDITION_FAILED), 409 ROLE_SYSTEM / ROLE_IN_USE
 *   GET  /api/orgs/{o}/roles/{id}/diff       against the template
 *   POST /api/orgs/{o}/roles/{id}/resync     restore the template's rows
 *   GET  /api/orgs/{o}/roles/history, /roles/{id}/history   the audit rows of this process
 *   GET  /api/orgs/{o}/permissions           the catalog with `grantable` against the caller's own permissions
 *   PUT  /api/orgs/{o}/members/{m}/roles     replace a member's roles
 *
 * It mirrors the API's rules where the page shows them (ceiling = what the caller holds, the Owner holds everything, org.close and
 * org.transfer_ownership are the Owner's alone, system roles are read only). The real API is the truth; keep this in step with it.
 * POST /mock/roles/reset restores the seed.
 */
import { createHash } from "node:crypto";
import { MEMBERS, ORGS, REGISTRY, ROLES, meTenantFor } from "./mock-me-tenant.mjs";

const ORDER = ["OWN", "ASSIGNED", "TEAM", "DEPARTMENT", "ORG"];
const rank = (s) => ORDER.indexOf(s);
const OWNER_ONLY = ["org.close", "org.transfer_ownership"];
const SELF = ["self.share_scope.set", "self.leave"];
const at = (scope, keys) => Object.fromEntries(keys.map((k) => [k, scope]));

const SYSTEM = [
  ["OWNER", "Owner", "Everything an Organization Admin can do, plus closing the organization and handing it over. Cannot be edited."],
  ["ORG_ADMIN", "Organization Admin", "Runs the organization: settings, people, roles, licences and billing. Cannot close it or hand it over."],
  ["STAFF", "Staff", "Looks after a group of members."],
  ["MEMBER", "Member", "An ordinary member of the organization."],
  ["CONSULTANT", "Consultant", "A consultant: their own opportunities, applications, interviews and resumes. Submits for themselves."],
  ["MARKETING_SPECIALIST", "Marketing Specialist", "Prepares and tracks applications for the consultants assigned to them. Never submits."],
  ["MARKETING_MANAGER", "Marketing Manager", "Leads a marketing team: assignments, approvals, workload and escalations."],
  ["HR_SPECIALIST", "HR Specialist", "People operations: invitations, teams, lifecycle and HR records."],
  ["FINANCE_SPECIALIST", "Finance Specialist", "Billing, licences, usage and finance records. Records money, never moves it."],
  ["ACCOUNT_MANAGER", "Account Manager", "Client accounts, requirements, offers and placements."],
  ["TALENT_ACQUISITION", "Talent Acquisition", "Brings in candidates and consultants: invitations, talent pools and onboarding."],
  ["EXECUTIVE_VIEWER", "Executive Viewer", "Read-only organization dashboards, aggregates and totals."],
];
const FALLBACK = {
  STAFF: { ...at("ORG", ["members.invite", "members.import"]), ...at("ASSIGNED", ["reports.view", "member.view_summary"]), ...at("OWN", SELF) },
  MEMBER: { ...at("OWN", ["ops.own_hours", ...SELF]) },
};
const sysGrants = (key) => ({ ...(ROLES[key]?.grants ?? FALLBACK[key] ?? {}) });

const PEOPLE_FAMILIES = ["member", "members", "consultants", "resumes", "pipeline", "reports", "assignments"];
const CATEGORY_OF_FAMILY = {};
for (const [cat, fams] of Object.entries({
  CORE_PLATFORM: ["self", "dashboard", "reports", "member", "services"],
  RECRUITING: ["pipeline", "clients", "placements", "talent", "resumes"],
  CONSULTANTS: ["consultants", "assignments", "licenses"],
  FINANCE: ["billing", "finance", "ops"],
  ADMINISTRATION: ["org", "members", "groups", "roles", "audit", "integrations", "hr"],
})) for (const f of fams) CATEGORY_OF_FAMILY[f] = cat;
const CATEGORIES = [
  ["CORE_PLATFORM", "Core Platform"],
  ["RECRUITING", "Recruiting"],
  ["CONSULTANTS", "Consultants"],
  ["FINANCE", "Finance"],
  ["ADMINISTRATION", "Administration"],
];
const categoryOf = (def) => CATEGORY_OF_FAMILY[def.family] ?? "ADMINISTRATION";
const labelOf = (key) => {
  const t = key.endsWith(".*") ? `${key.slice(0, -2)} (all)` : key.replace(/[._]/g, " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
};

const hash = (o) => `W/"${createHash("sha256").update(JSON.stringify(o)).digest("hex").slice(0, 16)}"`;
const clone = (o) => JSON.parse(JSON.stringify(o));
const jwtSub = (req) => {
  try {
    return JSON.parse(Buffer.from((req.headers.authorization ?? "").replace(/^Bearer\s+/i, "").split(".")[1] ?? "", "base64url").toString()).sub ?? null;
  } catch {
    return null;
  }
};

export function createRolesMock({ json, withBody, hostOf }) {
  /** orgId -> state */
  let state;
  const seed = () => {
    state = {};
    for (const [host, org] of Object.entries(ORGS)) {
      state[org.id] = { host, nextId: 100, custom: [], assignments: {}, audit: [], seq: 0 };
    }
  };
  seed();

  const sysId = (key) => SYSTEM.findIndex(([k]) => k === key) + 1;
  const sysRole = (key) => {
    const i = SYSTEM.findIndex(([k]) => k === key);
    const [k, name, description] = SYSTEM[i];
    const grants = sysGrants(k);
    return { id: i + 1, key: k, name, description, templateKey: null, system: true, editable: false, workspaceKey: ROLES[k]?.workspace ?? null, rows: Object.entries(grants).map(([key2, scope]) => ({ key: key2, scope, ceilingRoleKey: key2 === "members.role.set" && k === "ORG_ADMIN" ? "BELOW_ADMIN" : null, rowFilter: null })) };
  };
  const roleById = (st, id) => (id >= 1 && id <= SYSTEM.length ? sysRole(SYSTEM[id - 1][0]) : (st.custom.find((r) => r.id === id) ?? null));
  const allRoles = (st) => [...SYSTEM.map(([k]) => sysRole(k)), ...st.custom];

  const memberRoleIds = (st, host, login, m) => st.assignments[m.id] ?? m.roles.map(sysId);
  const liveMembers = (st) => Object.entries(MEMBERS[st.host] ?? {}).filter(([, m]) => m.status === "ACTIVE");
  const assignedCount = (st, roleId) => liveMembers(st).filter(([login, m]) => memberRoleIds(st, st.host, login, m).includes(roleId)).length;

  const scopeLevel = (rows) => {
    let best = null;
    for (const r of rows) if (!SELF.includes(r.key) && (best === null || rank(r.scope) > rank(best))) best = r.scope;
    return best ?? "OWN";
  };
  const LABEL = { ORG: "Organization", DEPARTMENT: "Department", TEAM: "Team", ASSIGNED: "Assigned", OWN: "Personal" };
  const version = (r) => hash([r.id, r.name, r.description ?? null, r.templateKey ?? null, [...r.rows].sort((a, b) => a.key.localeCompare(b.key)).map((p) => [p.key, p.scope, p.ceilingRoleKey ?? null, p.rowFilter ?? null])]);
  const detail = (st, r) => ({
    id: r.id, key: r.key, name: r.name, description: r.description ?? null, templateKey: r.templateKey ?? null, system: r.system, editable: r.editable,
    workspaceKey: r.workspaceKey ?? null, scopeLabel: r.system ? LABEL[scopeLevel(r.rows)] : "Custom", status: "ACTIVE", assignedUsers: assignedCount(st, r.id), version: version(r),
    permissions: [...r.rows].sort((a, b) => a.key.localeCompare(b.key)).map((p) => ({ key: p.key, scope: p.scope, ceilingRoleKey: p.ceilingRoleKey ?? null, rowFilter: p.rowFilter ?? null })),
  });

  /** The caller: their effective permissions (what they hold) and whether they are an Owner. */
  function caller(st, req) {
    const login = jwtSub(req);
    const m = login && MEMBERS[st.host]?.[login];
    if (!m || m.status !== "ACTIVE") return null;
    const me = meTenantFor(st.host, login);
    const perms = me?.body.permissions ?? {};
    return { login, member: m, perms, owner: m.roles.includes("OWNER"), canManage: perms["roles.manage"] === "ORG" };
  }
  const holds = (c, key, scope) => scope === "OWN" || c.owner || (c.perms[key] !== undefined && rank(c.perms[key]) >= rank(scope));
  const ceilingFor = (c, key) => (c.owner || key !== "members.role.set" ? null : "BELOW_ADMIN");

  const choicesOf = (def) => {
    const out = new Set();
    if (def.scope === "OWN") out.add("OWN");
    else if (PEOPLE_FAMILIES.includes(def.family)) ["ASSIGNED", "TEAM", "DEPARTMENT", "ORG"].forEach((s) => out.add(s));
    else out.add("ORG");
    if (!def.key.startsWith("self.")) for (const [k] of SYSTEM) { const g = sysGrants(k)[def.key]; if (g) out.add(g); }
    if (def.acting) out.delete("OWN");
    return ORDER.filter((s) => out.has(s));
  };

  function catalog(st, c) {
    const cats = CATEGORIES.map(([key, label]) => ({ key, label, keyCount: 0, permissionSets: 0, permissions: [], fams: new Set() }));
    for (const def of REGISTRY) {
      const cat = cats.find((x) => x.key === categoryOf(def));
      const scopes = choicesOf(def).map((s) => ({ scope: s, grantable: !!c && c.canManage && holds(c, def.key, s), ceilingRoleKey: c && c.canManage ? ceilingFor(c, def.key) : null, rowFilter: null }));
      const any = scopes.some((s) => s.grantable);
      cat.permissions.push({
        key: def.key, family: def.family, label: labelOf(def.key), description: def.description, dangerous: def.dangerous, actsForOthers: !!def.acting, defaultScope: def.scope, scopes,
        grantable: any, reason: any ? null : !c?.canManage ? "NO_PERMISSION" : OWNER_ONLY.includes(def.key) ? "OWNER_ONLY" : "BEYOND_YOUR_ACCESS",
      });
      cat.fams.add(def.family);
    }
    const fams = new Set(REGISTRY.map((d) => d.family));
    return {
      canManage: !!c?.canManage, totalKeys: REGISTRY.length, permissionSets: fams.size,
      categories: cats.map((x) => ({ key: x.key, label: x.label, keyCount: x.permissions.length, permissionSets: x.fams.size, permissions: x.permissions })),
    };
  }

  function overview(st) {
    const roles = allRoles(st);
    const granted = new Set(roles.flatMap((r) => r.rows.map((p) => p.key)));
    const total = REGISTRY.length;
    const slices = CATEGORIES.map(([key, label]) => {
      const defs = REGISTRY.filter((d) => categoryOf(d) === key);
      return { category: key, label, keys: defs.length, grantedKeys: defs.filter((d) => granted.has(d.key)).length, percent: Math.round((100 * defs.length) / total), permissionSets: new Set(defs.map((d) => d.family)).size };
    });
    const withRole = liveMembers(st).filter(([login, m]) => memberRoleIds(st, st.host, login, m).length > 0).length;
    return {
      roles: roles.map((r) => ({
        id: r.id, key: r.key, name: r.name, description: r.description ?? null, templateKey: r.templateKey ?? null, scopeLabel: r.system ? LABEL[scopeLevel(r.rows)] : "Custom", scopeLevel: scopeLevel(r.rows),
        system: r.system, editable: r.editable, status: "ACTIVE", assignedUsers: assignedCount(st, r.id), permissionCount: r.rows.length, version: version(r),
      })),
      totalRoles: roles.length, activeUsers: withRole, customRoleCount: st.custom.length, systemRoleCount: SYSTEM.length, totalPermissionKeys: total, permissionOverview: slices,
      permissionSetCount: new Set(REGISTRY.map((d) => d.family)).size,
    };
  }

  const problem = (res, status, code, message, extra = {}) => json(res, status, { status, code, message, detail: message, ...extra });
  const notFound = (res) => problem(res, 404, "NOT_FOUND", "error.org");

  const SELF_ROWS = SELF.map((key) => ({ key, scope: "OWN", ceilingRoleKey: null, rowFilter: null }));

  /** Validates the wanted rows against the caller's ceiling; returns an error answer or the cleaned rows. */
  function wanted(c, input, inherit = []) {
    const out = new Map();
    for (const p of input) {
      const def = REGISTRY.find((d) => d.key === p?.key);
      if (!def || !ORDER.includes(p.scope)) return { error: [422, "ORG_INVALID", "permissions: is not valid", { field: "permissions" }] };
      if (def.acting && p.scope === "OWN") return { error: [422, "ORG_INVALID", "a permission that acts for another person cannot be OWN", { field: "permissions" }] };
      const old = inherit.find((r) => r.key === p.key);
      out.set(p.key, { key: p.key, scope: p.scope, ceilingRoleKey: p.ceilingRoleKey ?? old?.ceilingRoleKey ?? null, rowFilter: p.rowFilter ?? old?.rowFilter ?? null });
    }
    for (const r of SELF_ROWS) if (!out.has(r.key)) out.set(r.key, { ...r });
    return { rows: [...out.values()] };
  }
  const beyond = (c, rows) => rows.find((r) => !holds(c, r.key, r.scope) || (r.key === "members.role.set" && !c.owner && r.ceilingRoleKey !== "BELOW_ADMIN" && r.ceilingRoleKey !== "MEMBER"));
  const ceilingError = (res, r) => problem(res, 422, "ROLE_CEILING", `You cannot grant ${r.key} at ${r.scope}: you do not hold it`, { key: r.key, scope: r.scope });

  function record(st, c, action, risk, targetType, targetId, roleName, details) {
    st.audit.unshift({ id: ++st.seq, action, risk, actor: c.login, targetType, targetId: targetId == null ? null : String(targetId), targetLogin: null, roleName, at: new Date().toISOString(), details });
  }
  const diffOf = (before, after) => {
    const b = new Map(before.map((r) => [r.key, r]));
    const a = new Map(after.map((r) => [r.key, r]));
    return {
      added: [...a.values()].filter((r) => !b.has(r.key)).map((r) => `${r.key}@${r.scope}`),
      removed: [...b.keys()].filter((k) => !a.has(k)),
      scopeChanged: [...a.values()].filter((r) => b.has(r.key) && b.get(r.key).scope !== r.scope).map((r) => ({ key: r.key, from: b.get(r.key).scope, to: r.scope })),
    };
  };
  const sameRows = (x, y) => JSON.stringify(diffOf(x, y)) === JSON.stringify({ added: [], removed: [], scopeChanged: [] });

  const checkVersion = (res, req, role) => {
    const h = req.headers["if-match"];
    if (!h) return problem(res, 428, "PRECONDITION_REQUIRED", "Send the version you loaded in an If-Match header"), false;
    if (String(h).replace(/^W\//, "").replace(/"/g, "") !== version(role).replace(/^W\//, "").replace(/"/g, "")) return problem(res, 412, "PRECONDITION_FAILED", "The role changed since you loaded it", { currentVersion: version(role) }), false;
    return true;
  };

  return function handle(req, res, path, method) {
    if (path === "/mock/roles/reset" && method === "POST") {
      seed();
      return json(res, 200, { ok: true }), true;
    }
    const m = /^\/api\/orgs\/(\d+)\/(roles|permissions|members)(?:\/(.*))?$/.exec(path);
    if (!m) return false;
    const st = state[Number(m[1])];
    const rest = (m[3] ?? "").split("/").filter(Boolean);
    if (m[2] === "members" && !(rest.length === 2 && rest[1] === "roles")) return false;
    if (!st) return notFound(res), true;
    const host = hostOf(req);
    const c = host === st.host ? caller(st, req) : null;
    if (!c) return notFound(res), true;

    if (m[2] === "permissions" && method === "GET" && rest.length === 0) return json(res, 200, catalog(st, c)), true;

    if (m[2] === "members") {
      if (method !== "PUT") return notFound(res), true;
      if (!c.canManage) return notFound(res), true;
      return withBody(req, (b) => {
        const target = Object.entries(MEMBERS[st.host]).find(([, mm]) => String(mm.id) === rest[0]);
        if (!target) return notFound(res);
        if (target[1].id === c.member.id) return problem(res, 422, "ROLE_CEILING", "You cannot change your own roles", { reason: "SELF" });
        const ids = Array.isArray(b.roleIds) ? b.roleIds.map(Number) : [];
        if (ids.length === 0) return problem(res, 422, "ORG_INVALID", "roleIds: at least one role is required", { field: "roleIds" });
        const roles = ids.map((id) => roleById(st, id));
        if (roles.some((r) => !r)) return notFound(res);
        for (const r of roles) {
          const bad = beyond(c, r.rows);
          if (bad) return ceilingError(res, bad);
          if (!c.owner && (r.key === "OWNER" || r.key === "ORG_ADMIN")) return problem(res, 422, "ROLE_CEILING", "Your role may not give or take away this role", { reason: "ADMIN_ROLE", role: r.key });
        }
        const primary = Number(b.primaryRoleId ?? ids[0]);
        st.assignments[target[1].id] = [primary, ...ids.filter((i) => i !== primary)];
        record(st, c, "ROLE_ASSIGN", "MEDIUM", "MEMBER", target[1].id, null, { added: roles.map((r) => r.key), removed: [] });
        return json(res, 200, { memberId: target[1].id, legacyRole: null, roles: st.assignments[target[1].id].map((id, i) => ({ roleId: id, key: roleById(st, id).key, name: roleById(st, id).name, primary: i === 0 })) });
      }), true;
    }

    // ---- roles ---------------------------------------------------------------------------------------------------------
    if (rest.length === 0 && method === "GET") return json(res, 200, allRoles(st).map((r) => ({ id: r.id, key: r.key, name: r.name, description: r.description ?? null, templateKey: r.templateKey ?? null, system: r.system, editable: r.editable, workspaceKey: r.workspaceKey ?? null, permissions: r.rows }))), true;
    if (rest[0] === "overview" && method === "GET") return json(res, 200, overview(st)), true;
    if (rest[0] === "history" && method === "GET") {
      if (!c.canManage) return notFound(res), true;
      const limit = Number(new URL(req.url, "http://x").searchParams.get("limit") ?? "50");
      return json(res, 200, st.audit.slice(0, limit)), true;
    }

    if (rest.length === 0 && method === "POST") {
      if (!c.canManage) return notFound(res), true;
      return withBody(req, (b) => {
        const name = String(b.name ?? "").trim();
        if (!name) return problem(res, 422, "ORG_INVALID", "name: is required", { field: "name" });
        if (allRoles(st).some((r) => r.name.toLowerCase() === name.toLowerCase())) return problem(res, 409, "ROLE_NAME_TAKEN", `A role named '${name}' already exists`, { name });
        let source = null;
        if (b.templateKey) source = SYSTEM.some(([k]) => k === b.templateKey) && b.templateKey !== "OWNER" ? sysRole(b.templateKey) : "bad";
        if (b.sourceRoleId) source = roleById(st, Number(b.sourceRoleId));
        if (source === "bad") return problem(res, 422, "ORG_INVALID", "templateKey: is not a role template", { field: "templateKey" });
        if (b.sourceRoleId && !source) return notFound(res);
        if (source?.key === "OWNER") return problem(res, 409, "ROLE_SYSTEM", "The Owner role cannot be cloned");
        const inherit = source?.rows ?? [];
        const w = Array.isArray(b.permissions) ? wanted(c, b.permissions, inherit) : { rows: [...inherit.map((r) => ({ ...r })), ...SELF_ROWS.filter((r) => !inherit.some((x) => x.key === r.key))] };
        if (w.error) return problem(res, ...w.error);
        const bad = beyond(c, w.rows);
        if (bad) return ceilingError(res, bad);
        const role = {
          id: st.nextId++, key: `CUSTOM_${name.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`, name, description: b.description ? String(b.description) : (source?.description ?? null),
          templateKey: source ? (source.system ? source.key : source.templateKey ?? null) : null, system: false, editable: true, workspaceKey: source?.workspaceKey ?? null, rows: w.rows,
        };
        st.custom.push(role);
        record(st, c, "ROLE_CREATE", w.rows.some((r) => REGISTRY.find((d) => d.key === r.key)?.dangerous) ? "HIGH" : "MEDIUM", "ROLE", role.id, role.name, { name, permissions: role.rows.length });
        res.setHeader?.("etag", version(role));
        return json(res, 201, detail(st, role));
      }), true;
    }

    const role = roleById(st, Number(rest[0]));
    if (!role) return notFound(res), true;
    const sub = rest[1];

    if (!sub && method === "GET") return json(res, 200, detail(st, role)), true;

    if (sub === "diff" && method === "GET") {
      const tpl = !role.system && role.templateKey ? sysRole(role.templateKey) : null;
      if (!tpl) return json(res, 200, { roleId: role.id, template: null, templateName: null, hasTemplate: false, matches: true, added: [], removed: [], scopeChanged: [], attributesChanged: [] }), true;
      const d = diffOf(tpl.rows, role.rows);
      const tplMap = new Map(tpl.rows.map((r) => [r.key, r]));
      const out = {
        roleId: role.id, template: tpl.key, templateName: tpl.name, hasTemplate: true, matches: d.added.length + d.removed.length + d.scopeChanged.length === 0,
        added: d.added.map((s) => ({ key: s.split("@")[0], scope: s.split("@")[1] })), removed: d.removed.map((k) => ({ key: k, scope: tplMap.get(k)?.scope ?? null })), scopeChanged: d.scopeChanged, attributesChanged: [],
      };
      return json(res, 200, out), true;
    }

    if (sub === "history" && method === "GET") {
      if (!c.canManage) return notFound(res), true;
      return json(res, 200, st.audit.filter((a) => a.targetType === "ROLE" && a.targetId === String(role.id))), true;
    }

    // everything below writes
    if (!c.canManage) return notFound(res), true;
    if (role.system) return problem(res, 409, "ROLE_SYSTEM", "System roles cannot be changed: clone the role first"), true;

    if (sub === "resync" && method === "POST") {
      if (!checkVersion(res, req, role)) return true;
      const tpl = role.templateKey ? sysRole(role.templateKey) : null;
      if (!tpl) return problem(res, 422, "ORG_INVALID", "templateKey: this role was not made from a template, so there is nothing to restore", { field: "templateKey" }), true;
      const after = [...tpl.rows.map((r) => ({ ...r })), ...SELF_ROWS.filter((r) => !tpl.rows.some((x) => x.key === r.key))];
      const bad = beyond(c, role.rows) ?? beyond(c, after);
      if (bad) return ceilingError(res, bad), true;
      if (!sameRows(role.rows, after)) {
        const d = diffOf(role.rows, after);
        role.rows = after;
        record(st, c, "ROLE_RESYNC", "HIGH", "ROLE", role.id, role.name, { template: tpl.key, ...d });
      }
      return json(res, 200, detail(st, role)), true;
    }

    if (!sub && method === "PATCH") {
      if (!checkVersion(res, req, role)) return true;
      return withBody(req, (b) => {
        const bad0 = beyond(c, role.rows);
        if (bad0) return ceilingError(res, bad0);
        const name = b.name === undefined ? role.name : String(b.name).trim();
        if (!name) return problem(res, 422, "ORG_INVALID", "name: is required", { field: "name" });
        if (name.toLowerCase() !== role.name.toLowerCase() && allRoles(st).some((r) => r.name.toLowerCase() === name.toLowerCase())) return problem(res, 409, "ROLE_NAME_TAKEN", `A role named '${name}' already exists`, { name });
        let rows = role.rows;
        if (Array.isArray(b.permissions)) {
          const w = wanted(c, b.permissions, role.rows);
          if (w.error) return problem(res, ...w.error);
          const bad = beyond(c, w.rows);
          if (bad) return ceilingError(res, bad);
          rows = w.rows;
        }
        const d = diffOf(role.rows, rows);
        const changed = d.added.length + d.removed.length + d.scopeChanged.length > 0;
        const renamed = name !== role.name || (b.description !== undefined && String(b.description).trim() !== (role.description ?? ""));
        if (changed || renamed) {
          role.name = name;
          if (b.description !== undefined) role.description = String(b.description).trim() || null;
          role.rows = rows;
          record(st, c, "ROLE_UPDATE", changed ? "HIGH" : "LOW", "ROLE", role.id, role.name, { ...(renamed ? { name } : {}), ...(changed ? d : {}) });
        }
        return json(res, 200, detail(st, role));
      }), true;
    }

    if (!sub && method === "DELETE") {
      if (!checkVersion(res, req, role)) return true;
      const bad = beyond(c, role.rows);
      if (bad) return ceilingError(res, bad), true;
      const n = assignedCount(st, role.id);
      if (n > 0) return problem(res, 409, "ROLE_IN_USE", `The role is still assigned to ${n} member(s)`, { count: n }), true;
      st.custom = st.custom.filter((r) => r.id !== role.id);
      record(st, c, "ROLE_DELETE", "MEDIUM", "ROLE", role.id, role.name, { name: role.name, key: role.key, permissions: role.rows.length });
      res.writeHead(204);
      res.end();
      return true;
    }
    return notFound(res), true;
  };
}

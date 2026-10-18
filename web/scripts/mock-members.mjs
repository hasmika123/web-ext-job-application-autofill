/**
 * The Employees API mock (X4.12), in memory, DEV ONLY: the same routes and shapes as `OrgMemberResource`, `OrgMemberBulkResource`,
 * `OrgMemberLifecycleResource`, `OrgMemberRoleResource` and the roles / groups lists (X4.3, X4.4, X1.14) for Acme (org 2), from the
 * demo roster (`fixtures/enterprise-demo.json`). A caller outside Acme gets the generic 404, like the real API.
 *
 * What it keeps faithful: the page / X-Total-Count shape, `summaryOnly`, KPI tiles with `previous`/`delta` (some null on purpose, so
 * the page's "no delta" path is walkable), ETag + If-Match (412), Idempotency-Key (400 without), per-row bulk results with `previous`,
 * ROLE_CEILING / LAST_ADMIN / SELF refusals, suspend / reinstate / offboard (now or scheduled) and the offboarding queue.
 *
 * Testing hook: POST /mock/members/reset restores the seed.
 */
import { ENTERPRISE_DEMO } from "./fixtures/enterprise.mjs";

export const ACME_ORG_ID = 2;

const ROLES = [
  { id: 1, key: "OWNER", name: "Owner", description: "Everything, including billing and closing the organization." },
  { id: 2, key: "ORG_ADMIN", name: "Organization Admin", description: "Runs the organization day to day." },
  { id: 3, key: "MARKETING_MANAGER", name: "Marketing Manager", description: "Leads marketers and their consultants." },
  { id: 4, key: "MARKETING_SPECIALIST", name: "Marketing Specialist", description: "Prepares applications for assigned consultants." },
  { id: 5, key: "HR_SPECIALIST", name: "HR Specialist", description: "People records and onboarding." },
  { id: 6, key: "FINANCE_SPECIALIST", name: "Finance Specialist", description: "Invoices and payroll records." },
  { id: 7, key: "ACCOUNT_MANAGER", name: "Account Manager", description: "Client relationships and placements." },
  { id: 8, key: "TALENT_ACQUISITION", name: "Talent Acquisition", description: "Sourcing and recruiting." },
  { id: 9, key: "EXECUTIVE_VIEWER", name: "Executive Viewer", description: "Read-only dashboards." },
  { id: 10, key: "CONSULTANT", name: "Consultant", description: "Applies to jobs through the organization." },
];
const ROLE_BY_KEY = Object.fromEntries(ROLES.map((r) => [r.key, r]));
const ADMIN_LEVEL = new Set(["OWNER", "ORG_ADMIN"]);

const GROUPS = [
  { id: 21, name: "Marketing", kind: "DEPARTMENT", memberCount: 0 },
  { id: 22, name: "Recruiting", kind: "DEPARTMENT", memberCount: 0 },
  { id: 23, name: "Finance", kind: "DEPARTMENT", memberCount: 0 },
  { id: 31, name: "Growth", kind: "TEAM", memberCount: 0 },
  { id: 32, name: "Delivery", kind: "TEAM", memberCount: 0 },
];

const initials = (n) => n.split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase();

function seed() {
  const people = ENTERPRISE_DEMO["acme.localhost"].people;
  const t0 = Date.parse("2026-08-14T07:49:00Z");
  const seats = [
    { id: 101, key: "owner", name: "Olivia Owner", email: "owner@acme.example.com", status: "ACTIVE", roleKeys: ["OWNER"], joined: "2026-08-01T09:00:00Z" },
    ...people.map((p, i) => ({
      id: 1 + i,
      key: p.key,
      name: `${p.first} ${p.last}`,
      email: `${p.first}.${p.last}@acme.example.com`.toLowerCase(),
      status: p.status,
      roleKeys: p.roles,
      joined: new Date(t0 + i * 3 * 86400000).toISOString(),
    })),
  ].map((s) => ({
    id: s.id,
    key: s.key,
    name: s.name,
    email: s.email,
    status: s.status,
    title: null,
    roleIds: s.roleKeys.map((k) => ROLE_BY_KEY[k].id),
    primaryRoleId: ROLE_BY_KEY[s.roleKeys[0]].id,
    departmentId: null,
    teamId: null,
    managerId: null,
    joinedAt: s.status === "INVITED" ? null : s.joined,
    lastActiveAt: s.status === "ACTIVE" ? "2026-10-12T15:00:00Z" : null,
    version: 1,
  }));
  const byKey = Object.fromEntries(seats.map((s) => [s.key, s]));
  const set = (k, dept, team, mgr, title) => Object.assign(byKey[k], { departmentId: dept, teamId: team, managerId: mgr ? byKey[mgr].id : null, title });
  set("sarah", 21, 31, "owner", "Head of Operations");
  set("omar", 21, 31, "sarah", "Marketing Specialist");
  set("anika", 22, 32, "sarah", "Consultant");
  set("ben", 22, 32, "omar", "Consultant");
  set("hana", 22, null, "sarah", "People Partner");
  set("felix", 23, null, "sarah", "Finance Analyst");
  return seats;
}

export function createMembersMock({ json, subOf = () => null }) {
  let seats = seed();
  let scheduled = [];
  let nextSched = 1;
  const idem = new Map();
  const reset = () => {
    seats = seed();
    scheduled = [];
    idem.clear();
  };

  const callerOf = (req) => {
    const sub = subOf(req);
    if (!sub) return null;
    if (sub === "owner@acme.com") return seats.find((s) => s.key === "owner");
    const m = /^demo-ent-acme-(.+)$/.exec(sub);
    return m ? (seats.find((s) => s.key === m[1]) ?? null) : null;
  };
  const group = (id) => (id ? { id, name: GROUPS.find((g) => g.id === id)?.name ?? "Group" } : null);
  const person = (id) => {
    const s = seats.find((x) => x.id === id);
    return s ? { memberId: s.id, name: s.name, avatarUrl: null } : null;
  };
  const roleRefs = (s) => s.roleIds.map((id) => ({ roleId: id, key: ROLES.find((r) => r.id === id).key, name: ROLES.find((r) => r.id === id).name, primary: id === s.primaryRoleId })).sort((a, b) => Number(b.primary) - Number(a.primary));
  const live = (s) => s.status === "ACTIVE" || s.status === "SUSPENDED";
  const adminCount = () => seats.filter((s) => s.status === "ACTIVE" && s.roleIds.some((id) => ADMIN_LEVEL.has(ROLES.find((r) => r.id === id).key))).length;
  const isAdmin = (s) => s.roleIds.some((id) => ADMIN_LEVEL.has(ROLES.find((r) => r.id === id).key));

  const row = (s) => ({
    id: s.id, name: s.name, initials: initials(s.name), workEmail: s.email, avatarUrl: null, status: s.status, title: s.title, roles: roleRefs(s),
    department: group(s.departmentId), team: group(s.teamId), manager: person(s.managerId), joinedAt: s.joinedAt, lastActiveAt: s.lastActiveAt,
    consentScope: "SUMMARY", invite: s.status === "INVITED" ? { expiresAt: "2026-10-20T09:00:00Z", expired: false } : null, summaryOnly: false,
  });

  const detail = (s, caller) => ({
    ...row(s), phone: null, location: null, timezone: null, statusSince: s.joinedAt, primaryRoleKey: ROLES.find((r) => r.id === s.primaryRoleId).key,
    directReports: seats.filter((x) => x.managerId === s.id).map((x) => person(x.id)), leftAt: s.leftAt ?? null, consentFullTo: null,
    scheduledOffboarding: scheduled.filter((q) => q.memberId === s.id).map((q) => ({ id: q.id, effectiveAt: q.effectiveAt, reason: q.reason, createdAt: q.createdAt }))[0] ?? null,
    actions: {
      edit: live(s) || s.status === "INVITED",
      manageRoles: live(s) && s.id !== caller.id,
      suspend: s.status === "ACTIVE" && s.id !== caller.id,
      reinstate: s.status === "SUSPENDED",
      offboard: live(s) && s.id !== caller.id,
      viewActivity: true,
    },
    recentActivity: [], version: `"${s.version}"`,
  });

  const readBody = (req, cb) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      try {
        cb(raw ? JSON.parse(raw) : {});
      } catch {
        cb(null);
      }
    });
  };
  const problem = (res, status, code, detailText, extra = {}) => json(res, status, { type: "about:blank", title: detailText, status, detail: detailText, code, ...extra });
  const notFound = (res) => problem(res, 404, "NOT_FOUND", "Not found");

  const tile = (value, previous) => ({ value, previous, delta: previous === null ? null : value - previous, deltaPercent: previous === null || previous === 0 ? null : Math.round((1000 * (value - previous)) / previous) / 10 });

  function counts() {
    const n = (st) => seats.filter((s) => s.status === st).length;
    const live3 = seats.filter((s) => ["INVITED", "ACTIVE", "SUSPENDED"].includes(s.status)).length;
    return {
      asOf: "2026-09-13T09:00:00Z", scope: "ORG",
      total: tile(live3, live3 - 1), active: tile(n("ACTIVE"), n("ACTIVE") - 1), invited: tile(n("INVITED"), 2), suspended: tile(n("SUSPENDED"), null),
      departments: tile(GROUPS.filter((g) => g.kind === "DEPARTMENT").length, null), teams: tile(GROUPS.filter((g) => g.kind === "TEAM").length, null),
    };
  }

  function list(url) {
    const q = url.searchParams;
    const text = (q.get("q") ?? "").trim().toLowerCase();
    const statuses = (q.getAll("status").join(",") || "INVITED,ACTIVE,SUSPENDED").split(",");
    let items = seats.filter((s) => statuses.includes(s.status));
    if (text.length >= 2) items = items.filter((s) => [s.name, s.email, s.title ?? "", ...roleRefs(s).map((r) => r.name), group(s.departmentId)?.name ?? "", group(s.teamId)?.name ?? ""].join(" ").toLowerCase().includes(text));
    if (q.get("roleId")) items = items.filter((s) => s.roleIds.includes(Number(q.get("roleId"))));
    if (q.get("departmentId")) items = items.filter((s) => s.departmentId === Number(q.get("departmentId")));
    if (q.get("teamId")) items = items.filter((s) => s.teamId === Number(q.get("teamId")));
    if (q.get("managerId")) items = items.filter((s) => s.managerId === Number(q.get("managerId")));
    const [key, dir] = (q.get("sort") ?? "joined,desc").split(",");
    const val = { name: (s) => s.name.toLowerCase(), joined: (s) => s.joinedAt ?? "", status: (s) => s.status, lastActive: (s) => s.lastActiveAt ?? "" }[key];
    if (!val) return null;
    items = [...items].sort((a, b) => (val(a) < val(b) ? -1 : val(a) > val(b) ? 1 : 0) * (dir === "desc" ? -1 : 1));
    const size = Math.min(100, Math.max(1, Number(q.get("size") ?? 25)));
    const page = Math.max(0, Number(q.get("page") ?? 0));
    return { items: items.slice(page * size, page * size + size).map(row), page, size, total: items.length, hasNext: (page + 1) * size < items.length };
  }

  /** The ceiling an Organization Admin works under: nobody below Owner may hand out or take an admin-level role. */
  const setRoles = (caller, seat, roleIds, primaryRoleId) => {
    if (seat.id === caller.id) return { status: 422, code: "ROLE_CEILING", extra: { reason: "SELF" } };
    const callerIsOwner = caller.roleIds.includes(1);
    const changed = [...roleIds.filter((r) => !seat.roleIds.includes(r)), ...seat.roleIds.filter((r) => !roleIds.includes(r))];
    if (!callerIsOwner && changed.some((id) => ADMIN_LEVEL.has(ROLES.find((r) => r.id === id)?.key))) return { status: 422, code: "ROLE_CEILING", extra: { reason: "ADMIN_ROLE" } };
    const wasAdmin = isAdmin(seat);
    const will = roleIds.some((id) => ADMIN_LEVEL.has(ROLES.find((r) => r.id === id)?.key));
    if (wasAdmin && !will && adminCount() <= 1) return { status: 409, code: "LAST_ADMIN", extra: {} };
    seat.roleIds = roleIds;
    seat.primaryRoleId = primaryRoleId;
    seat.version++;
    return { status: 200 };
  };

  return function handle(req, res, path, method) {
    if (path === "/mock/members/reset" && method === "POST") {
      reset();
      return json(res, 200, { ok: true }), true;
    }
    const m = /^\/api\/orgs\/(\d+)\/(members|roles|groups)(\/.*)?$/.exec(path);
    if (!m) return false;
    const [, orgId, area, restRaw] = m;
    const rest = restRaw ?? "";
    const caller = callerOf(req);
    if (!caller || Number(orgId) !== ACME_ORG_ID) return notFound(res), true;
    const url = new URL(req.url, "http://mock");

    if (area === "roles") {
      if (rest === "") return json(res, 200, ROLES.map((r) => ({ ...r, templateKey: r.key, system: true, editable: false, workspaceKey: null, permissions: [] }))), true;
      return notFound(res), true;
    }
    // only the bare list: /groups/structure, /directory, /{id} ... belong to mock-groups.mjs (handleGroups runs after this handler)
    if (area === "groups" && rest !== "") return false;
    if (area === "groups") return json(res, 200, GROUPS.map((g) => ({ ...g, memberCount: seats.filter((s) => s.departmentId === g.id || s.teamId === g.id).length, sortOrder: 0 }))), true;

    // /members ...
    if (method === "GET" && rest === "") {
      const body = list(url);
      return body ? json(res, 200, body) : problem(res, 400, "SORT_INVALID", "Unknown sort"), true;
    }
    if (method === "GET" && rest === "/counts") return json(res, 200, counts()), true;
    if (method === "GET" && rest === "/offboarding") return json(res, 200, { items: scheduled.map((q) => ({ id: q.id, memberId: q.memberId, name: seats.find((s) => s.id === q.memberId).name, effectiveAt: q.effectiveAt, reason: q.reason, createdAt: q.createdAt })) }), true;
    const del = /^\/offboarding\/(\d+)$/.exec(rest);
    if (method === "DELETE" && del) {
      const i = scheduled.findIndex((q) => q.id === Number(del[1]));
      if (i < 0) return notFound(res), true;
      scheduled.splice(i, 1);
      res.writeHead(204);
      return res.end(), true;
    }

    const bulk = /^\/bulk\/(roles|groups|manager|status)$/.exec(rest);
    if (method === "POST" && bulk) {
      if (!req.headers["idempotency-key"]) return problem(res, 400, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key header is required"), true;
      readBody(req, (b) => {
        if (!b || !Array.isArray(b.memberIds) || b.memberIds.length === 0) return problem(res, 422, "VALIDATION", "memberIds is required");
        const cacheKey = `${req.headers["idempotency-key"]}`;
        if (idem.has(cacheKey)) return json(res, 200, idem.get(cacheKey), { "Idempotent-Replayed": "true" });
        const results = b.memberIds.map((id) => {
          const seat = seats.find((s) => s.id === id);
          if (!seat) return { memberId: id, ok: false, reason: "NOT_FOUND", previous: null };
          if (bulk[1] === "roles") {
            const next = [...new Set([...seat.roleIds, ...(b.add ?? [])])].filter((r) => !(b.remove ?? []).includes(r));
            const primary = b.primaryRoleId ?? (next.includes(seat.primaryRoleId) ? seat.primaryRoleId : next[0]);
            if (next.length === seat.roleIds.length && next.every((r) => seat.roleIds.includes(r)) && primary === seat.primaryRoleId) return { memberId: id, ok: true, reason: "UNCHANGED", previous: null };
            const previous = { roleIds: [...seat.roleIds], primaryRoleId: seat.primaryRoleId };
            const out = setRoles(caller, seat, next, primary);
            return out.status === 200 ? { memberId: id, ok: true, reason: null, previous } : { memberId: id, ok: false, reason: out.extra.reason ?? out.code, previous: null };
          }
          if (bulk[1] === "groups") {
            const team = b.teamGroupId ?? null;
            const dept = b.departmentGroupId ?? (team ? ({ 31: 21, 32: 22 })[team] ?? null : null);
            const previous = { departmentGroupId: seat.departmentId, teamGroupId: seat.teamId };
            if (previous.departmentGroupId === dept && previous.teamGroupId === team) return { memberId: id, ok: true, reason: "UNCHANGED", previous: null };
            Object.assign(seat, { departmentId: dept, teamId: team, version: seat.version + 1 });
            return { memberId: id, ok: true, reason: null, previous };
          }
          if (bulk[1] === "manager") {
            const mgr = b.managerMemberId ?? null;
            if (mgr === id) return { memberId: id, ok: false, reason: "MANAGER_CYCLE", previous: null };
            const previous = { managerMemberId: seat.managerId };
            if (seat.managerId === mgr) return { memberId: id, ok: true, reason: "UNCHANGED", previous: null };
            seat.managerId = mgr;
            seat.version++;
            return { memberId: id, ok: true, reason: null, previous };
          }
          // status
          if (id === caller.id) return { memberId: id, ok: false, reason: "SELF", previous: null };
          const previous = { status: seat.status };
          if (b.action === "SUSPEND") {
            if (seat.status !== "ACTIVE") return { memberId: id, ok: false, reason: "INVALID_TRANSITION", previous: null };
            if (isAdmin(seat) && adminCount() <= 1) return { memberId: id, ok: false, reason: "LAST_ADMIN", previous: null };
            seat.status = "SUSPENDED";
          } else {
            if (seat.status !== "SUSPENDED") return { memberId: id, ok: false, reason: "INVALID_TRANSITION", previous: null };
            seat.status = "ACTIVE";
          }
          seat.version++;
          return { memberId: id, ok: true, reason: null, previous };
        });
        const body = { action: bulk[1] === "status" ? b.action : bulk[1].toUpperCase(), requested: results.length, ok: results.filter((r) => r.ok).length, skipped: results.filter((r) => !r.ok).map((r) => ({ memberId: r.memberId, reason: r.reason })), results };
        idem.set(cacheKey, body);
        json(res, 200, body);
      });
      return true;
    }

    const one = /^\/(\d+)(\/[a-z-]+)?$/.exec(rest);
    if (!one) return notFound(res), true;
    const seat = seats.find((s) => s.id === Number(one[1]));
    if (!seat) return notFound(res), true;
    const sub = one[2] ?? "";

    if (method === "GET" && sub === "") return json(res, 200, detail(seat, caller), { ETag: `"${seat.version}"` }), true;
    if (method === "GET" && sub === "/activity") {
      const dir = url.searchParams.get("direction") === "by" ? "by" : "on";
      const items = dir === "by" ? [] : [{ id: seat.id * 10, at: "2026-10-10T09:00:00Z", actor: person(caller.id), action: "MEMBER_GROUP", risk: "LOW", targetType: "MEMBER", summary: "Placement changed" }];
      return json(res, 200, { direction: dir, items, page: 0, size: 10, total: items.length, hasNext: false }), true;
    }
    if (method === "GET" && sub === "/offboard-preview") {
      const blockers = seat.id === caller.id ? [{ code: "SELF", message: "You can't offboard yourself." }] : isAdmin(seat) && adminCount() <= 1 ? [{ code: "LAST_ADMIN", message: "This is the last administrator." }] : [];
      return json(res, 200, { memberId: seat.id, name: seat.name, status: seat.status, blockers, lines: [{ hook: "sessions", kind: "REVOKE", text: "Their sign-in sessions end." }, { hook: "assignments", kind: "END", text: "Their consultant assignments are reviewed." }], rolesEnded: roleRefs(seat).map((r) => r.name), consentScope: "SUMMARY", recordsKept: ["resumes", "applications", "the audit trail"], licenseNotice: "Their seat is released at the end of the billing period." }), true;
    }

    if (method === "PATCH" && sub === "") {
      readBody(req, (b) => {
        if (!req.headers["if-match"]) return problem(res, 428, "PRECONDITION_REQUIRED", "If-Match is required");
        if (req.headers["if-match"] !== `"${seat.version}"`) return problem(res, 412, "PRECONDITION_FAILED", "The person changed");
        if (!b || Object.keys(b).some((k) => !["title", "departmentGroupId", "teamGroupId", "managerMemberId"].includes(k))) return problem(res, 422, "VALIDATION", "Unknown field");
        if ("title" in b) seat.title = b.title === null ? null : String(b.title).slice(0, 120);
        if ("departmentGroupId" in b) seat.departmentId = b.departmentGroupId;
        if ("teamGroupId" in b) {
          seat.teamId = b.teamGroupId;
          if (b.teamGroupId && !("departmentGroupId" in b)) seat.departmentId = { 31: 21, 32: 22 }[b.teamGroupId] ?? seat.departmentId;
        }
        if ("managerMemberId" in b) {
          if (b.managerMemberId === seat.id) return problem(res, 422, "MANAGER_CYCLE", "A person cannot report to themselves");
          seat.managerId = b.managerMemberId;
        }
        seat.version++;
        json(res, 200, detail(seat, caller), { ETag: `"${seat.version}"` });
      });
      return true;
    }
    if (method === "PUT" && sub === "/roles") {
      readBody(req, (b) => {
        const ids = Array.isArray(b?.roleIds) ? b.roleIds : [];
        if (ids.length === 0 || !ids.includes(b.primaryRoleId ?? ids[0])) return problem(res, 422, "VALIDATION", "roleIds must contain the primary role");
        const out = setRoles(caller, seat, ids, b.primaryRoleId ?? ids[0]);
        if (out.status !== 200) return problem(res, out.status, out.code, out.code === "LAST_ADMIN" ? "That would leave no administrator" : "That role is above your own access", out.extra);
        json(res, 200, { memberId: seat.id, legacyRole: "MEMBER", roles: roleRefs(seat) });
      });
      return true;
    }
    if (method === "POST" && ["/suspend", "/reinstate", "/offboard"].includes(sub)) {
      readBody(req, (b) => {
        if (seat.id === caller.id) return problem(res, 409, "SELF", "You can't do this to yourself");
        const previousStatus = seat.status;
        if (sub === "/suspend") {
          if (!b?.reason || b.reason.trim().length < 10) return problem(res, 422, "VALIDATION", "A reason of 10 to 500 characters is required");
          if (seat.status !== "ACTIVE") return problem(res, 409, "INVALID_TRANSITION", "Only an active person can be suspended");
          if (isAdmin(seat) && adminCount() <= 1) return problem(res, 409, "LAST_ADMIN", "This is the last administrator");
          seat.status = "SUSPENDED";
        } else if (sub === "/reinstate") {
          if (seat.status !== "SUSPENDED") return problem(res, 409, "INVALID_TRANSITION", "Only a suspended person can be reinstated");
          seat.status = "ACTIVE";
        } else {
          if (!req.headers["idempotency-key"]) return problem(res, 400, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key header is required");
          if (!b?.confirm || b.confirm.toLowerCase() !== seat.name.toLowerCase()) return problem(res, 422, "CONFIRM_MISMATCH", "Type the person's name to confirm");
          if (!b.reason || b.reason.trim().length < 10) return problem(res, 422, "VALIDATION", "A reason of 10 to 500 characters is required");
          if (isAdmin(seat) && adminCount() <= 1) return problem(res, 409, "LAST_ADMIN", "This is the last administrator");
          if (b.effectiveAt && Date.parse(b.effectiveAt) > Date.now()) {
            const q = { id: nextSched++, memberId: seat.id, effectiveAt: b.effectiveAt, reason: b.reason, createdAt: new Date().toISOString() };
            scheduled.push(q);
            return json(res, 200, { memberId: seat.id, action: "OFFBOARD_SCHEDULED", previousStatus, status: seat.status, scheduled: { id: q.id, effectiveAt: q.effectiveAt, reason: q.reason, createdAt: q.createdAt }, lines: [] });
          }
          seat.status = "REMOVED";
          seat.leftAt = new Date().toISOString();
        }
        seat.version++;
        json(res, 200, { memberId: seat.id, action: sub.slice(1).toUpperCase(), previousStatus, status: seat.status, scheduled: null, lines: [] });
      });
      return true;
    }
    return notFound(res), true;
  };
}


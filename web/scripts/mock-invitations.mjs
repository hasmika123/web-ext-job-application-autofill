/**
 * The Invitations API mock (X4.12 part), in memory, DEV ONLY. Answers the same routes as `OrgInvitationResource` (X1.8, X1.15) for
 * the tenant members whose session holds `members.invite` (owner@acme.com, sarah@acme.com, the Acme demo admins, Beta's owner),
 * plus the two reads the invite form needs (`GET /api/orgs/{id}/roles`, `GET /api/orgs/{id}/groups`):
 *
 *   GET  /invitations?status&roleId&departmentGroupId&from&to&q&page&size   POST /invitations (single or list, one row per entry)
 *   GET  /invitations/counts   GET /invitations/activity?limit
 *   POST /invitations/{id}/resend (3 a week, then 429)   POST /invitations/{id}/revoke (pending only, else 404)
 *   POST /invitations/bulk/resend   POST /invitations/bulk/revoke
 *
 * Another organization's id (the host's org is the only one a session may touch) is the API's generic 404; a member without
 * `members.invite` is a 404 too. Beta Talent starts with NO invitations so the empty state can be walked through.
 * Testing hook: POST /mock/invitations/reset restores the seed.
 */
import { meTenantFor } from "./mock-me-tenant.mjs";

const HOST_ORG = { "acme.localhost": 2, "beta.localhost": 3 };
const DAY = 86_400_000;
const EMAIL = /^[^\s@<>"]{1,64}@[A-Za-z0-9.-]{1,190}\.[A-Za-z]{2,24}$/;

const ROLES = [
  { id: 11, key: "ORG_ADMIN", name: "Organization Admin", description: "Runs the organization day to day." },
  { id: 12, key: "MARKETING_MANAGER", name: "Marketing Manager", description: "Leads the marketing team." },
  { id: 13, key: "MARKETING_SPECIALIST", name: "Marketing Specialist", description: "Prepares applications for consultants." },
  { id: 14, key: "CONSULTANT", name: "Consultant", description: "Looks for work through the organization." },
  { id: 15, key: "HR_SPECIALIST", name: "HR Specialist", description: "Onboarding, documents and compliance." },
  { id: 16, key: "FINANCE_SPECIALIST", name: "Finance Specialist", description: "Invoices, payments and timesheets." },
  { id: 17, key: "ACCOUNT_MANAGER", name: "Account Manager", description: "Owns client relationships." },
  { id: 18, key: "TALENT_ACQUISITION", name: "Talent Acquisition", description: "Finds and screens candidates." },
];
const DEPARTMENTS = { 2: [{ id: 21, name: "Marketing" }, { id: 22, name: "Consulting" }, { id: 23, name: "Finance" }, { id: 24, name: "HR" }], 3: [] };
const MEMBER_EMAILS = new Set(["owner@acme.com", "sarah@acme.com", "marketer@acme.com", "consultant@acme.com", "finance@acme.com", "owner@beta.com"]);

const role = (id) => ROLES.find((r) => r.id === id);
const clone = (o) => JSON.parse(JSON.stringify(o));
const iso = (t) => new Date(t).toISOString();

function seed(now) {
  const dept = (id) => DEPARTMENTS[2].find((d) => d.id === id);
  const mk = (id, name, email, roleId, deptId, by, status, daysAgo, extra = {}) => ({
    id,
    email,
    name,
    status,
    roles: [{ id: roleId, key: role(roleId).key, name: role(roleId).name, primary: true }],
    department: deptId ? { id: deptId, name: dept(deptId).name } : null,
    team: null,
    manager: null,
    invitedBy: { memberId: 103, name: by },
    invitedAt: iso(now - daysAgo * DAY - 3600_000),
    expiresAt: iso(now - daysAgo * DAY - 3600_000 + 14 * DAY),
    acceptedAt: null,
    endedAt: null,
    resendCount: 0,
    message: null,
    ...extra,
  });
  const at = (daysAgo) => iso(now - daysAgo * DAY);
  return [
    mk(1, "Emily Carter", "emily.carter@acme.com", 13, 21, "Sarah Singh", "PENDING", 2),
    mk(2, "James Wilson", "james.wilson@acme.com", 12, 21, "Sarah Singh", "ACCEPTED", 4, { acceptedAt: at(3.8), endedAt: at(3.8) }),
    mk(3, "Sophia Martinez", "sophia.martinez@acme.com", 14, 22, "Olivia Owner", "PENDING", 5),
    mk(4, "Daniel Kim", "daniel.kim@acme.com", 16, 23, "Sarah Singh", "ACCEPTED", 8, { acceptedAt: at(7), endedAt: at(7) }),
    mk(5, "Olivia Brown", "olivia.brown@acme.com", 15, 24, "Sarah Singh", "EXPIRED", 30, { endedAt: at(16) }),
    mk(6, "Liam Johnson", "liam.johnson@acme.com", 18, 24, "Olivia Owner", "REVOKED", 24, { endedAt: at(20) }),
    mk(7, "Noah Patel", "noah.patel@acme.com", 17, 22, "Sarah Singh", "PENDING", 9),
    mk(8, "Ava Thompson", "ava.thompson@acme.com", 13, 21, "Olivia Owner", "ACCEPTED", 12, { acceptedAt: at(11), endedAt: at(11) }),
    mk(9, "Mason Lee", "mason.lee@acme.com", 14, 22, "Sarah Singh", "PENDING", 1),
    mk(10, "Isabella Garcia", "isabella.garcia@acme.com", 15, 24, "Olivia Owner", "ACCEPTED", 40, { acceptedAt: at(39), endedAt: at(39) }),
    mk(11, "Ethan Brooks", "ethan.brooks@acme.com", 16, 23, "Sarah Singh", "EXPIRED", 45, { endedAt: at(31) }),
    mk(12, "Mia Rossi", "mia.rossi@acme.com", 13, 21, "Sarah Singh", "PENDING", 3, { message: "Welcome to the team!" }),
    mk(13, "Lucas Fernandez", "lucas.fernandez@acme.com", 14, 22, "Olivia Owner", "ACCEPTED", 55, { acceptedAt: at(54), endedAt: at(54) }),
    mk(14, "Chloe Nguyen", "chloe.nguyen@acme.com", 18, 24, "Sarah Singh", "REVOKED", 6, { endedAt: at(5) }),
  ];
}

export function createInvitationsMock({ json, withBody, hostOf }) {
  let state;
  const reset = () => {
    state = { 2: seed(Date.now()), 3: [] };
    nextId = 100;
  };
  let nextId = 100;
  reset();

  const problem = (res, status, code, message, extra = {}) => json(res, status, { status, code, title: code, detail: message, message, ...extra });
  const notFound = (res) => json(res, 404, { status: 404, code: "NOT_FOUND", title: "Not Found", detail: "Not found.", message: "error.org" });

  /** The caller's tenant session grants `members.invite` on the host's organization. */
  function actor(req) {
    const host = hostOf(req);
    const orgId = HOST_ORG[host];
    let sub = null;
    try {
      sub = JSON.parse(Buffer.from((req.headers.authorization ?? "").replace(/^Bearer\s+/i, "").split(".")[1] ?? "", "base64url").toString()).sub ?? null;
    } catch {
      /* no token */
    }
    const me = orgId && sub ? meTenantFor(host, sub) : null;
    if (!me || me.suspended || !me.body.permissions["members.invite"]) return null;
    return { orgId, name: me.body.person.name, memberId: me.body.member.id };
  }

  const countsOf = (list, now) => {
    const counts = ["PENDING", "ACCEPTED", "EXPIRED", "REVOKED"].map((status) => {
      const of = list.filter((i) => i.status === status);
      const recent = of.filter((i) => now - Date.parse(i.invitedAt) < 30 * DAY).length;
      const before = of.filter((i) => now - Date.parse(i.invitedAt) >= 30 * DAY && now - Date.parse(i.invitedAt) < 60 * DAY).length;
      return { status, count: of.length, deltaLastMonth: recent - before };
    });
    return { counts, total: list.length };
  };

  const activityOf = (list) => {
    const events = [];
    for (const i of list) {
      events.push({ kind: "INVITED", at: i.invitedAt, invitationId: i.id, email: i.email, name: i.name, actor: i.invitedBy });
      if (i.status === "ACCEPTED" && i.acceptedAt) events.push({ kind: "ACCEPTED", at: i.acceptedAt, invitationId: i.id, email: i.email, name: i.name, actor: null });
      if (i.status === "REVOKED" && i.endedAt) events.push({ kind: "REVOKED", at: i.endedAt, invitationId: i.id, email: i.email, name: i.name, actor: i.invitedBy });
      if (i.status === "EXPIRED" && i.endedAt) events.push({ kind: "EXPIRED", at: i.endedAt, invitationId: i.id, email: i.email, name: i.name, actor: null });
    }
    return events.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  };

  function inviteEntries(list, a, b) {
    const rows = [];
    const invited = [];
    const seen = new Set();
    const single = b.emails.length === 1;
    for (const entry of b.emails.map((e) => String(e).trim()).filter(Boolean)) {
      const m = /^(.*)<([^>]+)>$/.exec(entry);
      const email = (m ? m[2] : entry).trim().toLowerCase();
      const name = ((m ? m[1].trim() : "") || (single && b.fullName ? String(b.fullName).trim() : "")) || null;
      if (!EMAIL.test(email)) rows.push({ entry, email: null, status: "INVALID", reason: "malformed", memberId: null });
      else if (/\d{3}-?\d{2}-?\d{4}/.test(name ?? "")) rows.push({ entry, email, status: "INVALID", reason: "sensitive_name", memberId: null });
      else if (seen.has(email)) rows.push({ entry, email, status: "DUPLICATE", reason: "duplicate", memberId: null });
      else if (MEMBER_EMAILS.has(email)) rows.push({ entry, email, status: "ALREADY_MEMBER", reason: null, memberId: 1 });
      else if (list.some((i) => i.email === email && i.status === "PENDING")) rows.push({ entry, email, status: "DUPLICATE", reason: "already invited", memberId: null });
      else {
        seen.add(email);
        const roleIds = Array.isArray(b.roleIds) && b.roleIds.length ? b.roleIds : [14];
        const dept = (DEPARTMENTS[a.orgId] ?? []).find((d) => d.id === b.departmentGroupId) ?? null;
        const now = Date.now();
        const row = {
          id: ++nextId,
          email,
          name,
          status: "PENDING",
          roles: roleIds.map((id, k) => ({ id, key: role(id)?.key ?? "CONSULTANT", name: role(id)?.name ?? "Consultant", primary: k === 0 })),
          department: dept ? { id: dept.id, name: dept.name } : null,
          team: null,
          manager: null,
          invitedBy: { memberId: a.memberId, name: a.name },
          invitedAt: iso(now),
          expiresAt: iso(now + 14 * DAY),
          acceptedAt: null,
          endedAt: null,
          resendCount: 0,
          message: b.message ? String(b.message).slice(0, 500) : null,
        };
        list.unshift(row);
        invited.push({ memberId: row.id, email, name, role: "CONSULTANT", expiresAt: row.expiresAt, roleIds });
        rows.push({ entry, email, status: "INVITED", reason: null, memberId: row.id });
      }
    }
    return { batchId: ++nextId, invited, invalid: rows.filter((r) => r.status === "INVALID").map((r) => ({ entry: r.entry, reason: r.reason })), alreadyMember: rows.filter((r) => r.status === "ALREADY_MEMBER").map((r) => r.email), rows };
  }

  function resend(row) {
    if (row.status !== "PENDING" && row.status !== "EXPIRED") return { ok: false, code: "NOT_FOUND" };
    if (row.resendCount >= 3) return { ok: false, code: "RESEND_LIMIT" };
    row.resendCount += 1;
    row.status = "PENDING";
    row.endedAt = null;
    row.expiresAt = iso(Date.now() + 14 * DAY);
    return { ok: true };
  }
  function revoke(row) {
    if (row.status !== "PENDING") return false;
    row.status = "REVOKED";
    row.endedAt = iso(Date.now());
    return true;
  }

  return function handle(req, res, path, method) {
    if (path === "/mock/invitations/reset" && method === "POST") {
      req.resume();
      reset();
      return json(res, 200, { ok: true }), true;
    }
    const m = /^\/api\/orgs\/(\d+)\/(invitations|roles|groups)(\/[a-z0-9/]*)?$/.exec(path);
    if (!m) return false;
    const orgId = Number(m[1]);
    const a = actor(req);
    if (!a || a.orgId !== orgId) {
      req.resume();
      return notFound(res), true;
    }
    const list = state[orgId] ?? [];
    const url = new URL(req.url, "http://x");
    const sub = m[3] ?? "";

    if (m[2] === "roles" && method === "GET" && sub === "") return json(res, 200, ROLES.map((r) => ({ ...r, templateKey: r.key, system: true, editable: false, workspaceKey: "ADMIN", permissions: [] }))), true;
    if (m[2] === "groups" && method === "GET" && sub === "") return json(res, 200, (DEPARTMENTS[orgId] ?? []).map((d, k) => ({ id: d.id, name: d.name, kind: "DEPARTMENT", sortOrder: k, memberCount: 0 }))), true;
    if (m[2] !== "invitations") return false;

    if (sub === "" && method === "GET") {
      const q = url.searchParams;
      const needle = (q.get("q") ?? "").trim().toLowerCase();
      const from = q.get("from") ? Date.parse(q.get("from")) : null;
      const to = q.get("to") ? Date.parse(q.get("to")) : null;
      let rows = list.filter(
        (i) =>
          (!q.get("status") || i.status === q.get("status")) &&
          (!q.get("roleId") || i.roles.some((r) => r.id === Number(q.get("roleId")))) &&
          (!q.get("departmentGroupId") || i.department?.id === Number(q.get("departmentGroupId"))) &&
          (from === null || Date.parse(i.invitedAt) >= from) &&
          (to === null || Date.parse(i.invitedAt) < to) &&
          (!needle || i.email.includes(needle) || (i.name ?? "").toLowerCase().includes(needle) || i.roles.some((r) => r.name.toLowerCase().includes(needle))),
      );
      rows = rows.sort((x, y) => Date.parse(y.invitedAt) - Date.parse(x.invitedAt));
      const size = Math.min(100, Math.max(1, Number(q.get("size") ?? 25)));
      const page = Math.max(0, Number(q.get("page") ?? 0));
      return json(res, 200, { items: clone(rows.slice(page * size, page * size + size)), page, size, total: rows.length }), true;
    }
    if (sub === "/counts" && method === "GET") return json(res, 200, countsOf(list, Date.now())), true;
    if (sub === "/activity" && method === "GET") return json(res, 200, activityOf(list).slice(0, Math.min(50, Number(url.searchParams.get("limit") ?? 10)))), true;

    if (sub === "" && method === "POST") {
      withBody(req, (b) => {
        if (!Array.isArray(b.emails) || b.emails.length === 0) return problem(res, 400, "BAD_REQUEST", "Add at least one email address.");
        if (Array.isArray(b.roleIds) && b.roleIds.some((id) => id === 11)) return problem(res, 422, "ROLE_CEILING", "That role gives more access than you hold.");
        return json(res, 200, inviteEntries(list, a, b));
      });
      return true;
    }
    let r;
    if ((r = /^\/(\d+)\/(resend|revoke)$/.exec(sub)) && method === "POST") {
      req.resume();
      const row = list.find((i) => i.id === Number(r[1]));
      if (!row) return notFound(res), true;
      if (r[2] === "revoke") return revoke(row) ? (res.writeHead(204), res.end(), true) : (notFound(res), true);
      const out = resend(row);
      if (!out.ok) return out.code === "RESEND_LIMIT" ? (problem(res, 429, "RESEND_LIMIT", "That invitation was sent again too often this week. Try again later."), true) : (notFound(res), true);
      return json(res, 200, { memberId: row.id, email: row.email, name: row.name, expiresAt: row.expiresAt }), true;
    }
    if ((r = /^\/bulk\/(resend|revoke)$/.exec(sub)) && method === "POST") {
      withBody(req, (b) => {
        if (!Array.isArray(b.ids) || b.ids.length === 0 || b.ids.length > 100) return problem(res, 400, "BAD_REQUEST", "Send between 1 and 100 invitation ids.");
        const results = b.ids.map((id) => {
          const row = list.find((i) => i.id === id);
          if (!row) return { id, status: "FAILED", code: "NOT_FOUND" };
          if (r[1] === "revoke") return revoke(row) ? { id, status: "OK", code: null } : { id, status: "FAILED", code: "NOT_PENDING" };
          const out = resend(row);
          return out.ok ? { id, status: "OK", code: null } : { id, status: "FAILED", code: out.code };
        });
        return json(res, 200, { results });
      });
      return true;
    }
    req.resume();
    return notFound(res), true;
  };
}

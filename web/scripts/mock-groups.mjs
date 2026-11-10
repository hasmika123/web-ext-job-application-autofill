/**
 * The Departments and Teams API mock (X4.5), in memory, DEV ONLY. It answers the routes of `OrgGroupResource` for Acme (org id 2) with the
 * same seed the real `EnterpriseDemoSeeder` plants (five departments, three teams, leads, the demo people placed): GET list,
 * /directory, /structure, /pickers, /people, /{id}; POST create; PATCH /{id} (If-Match, 412/428); DELETE /{id} (only when empty, 409
 * GROUP_NOT_EMPTY); POST /{id}/members (per-row results); DELETE /{id}/members/{memberId}.
 * Who may: `groups.manage` (owner@acme.com, sarah@acme.com, demo-ent-acme-sarah, demo-ent-acme-hana) read and write; demo-ent-acme-eve
 * (an executive viewer) reads; anyone else gets the API's generic 404.
 * POST /mock/groups/reset restores the seed.
 */
import { demoPeople } from "./fixtures/enterprise.mjs";

export const ACME_ORG_ID = 2;
const MANAGE = new Set(["owner@acme.com", "sarah@acme.com", "demo-ent-acme-sarah", "demo-ent-acme-hana"]);
const READ = new Set([...MANAGE, "demo-ent-acme-eve"]);
const ICONS = ["briefcase", "users", "building", "chart", "heart", "rocket", "globe", "shield", "graduation", "dollar", "lightbulb", "handshake"];
const COLORS = ["primary", "secondary", "success", "info", "warning", "danger", "neutral"];
const ROLE_NAMES = {
  ORG_ADMIN: "Organization Admin",
  MARKETING_MANAGER: "Marketing Manager",
  MARKETING_SPECIALIST: "Marketing Specialist",
  CONSULTANT: "Consultant",
  HR_SPECIALIST: "HR Specialist",
  FINANCE_SPECIALIST: "Finance Specialist",
  ACCOUNT_MANAGER: "Account Manager",
  TALENT_ACQUISITION: "Talent Acquisition",
  EXECUTIVE_VIEWER: "Executive Viewer",
};

const STRUCTURE = [
  { name: "Consulting", icon: "briefcase", color: "primary", lead: "amara", people: ["amara", "sam", "nina"], teams: [{ name: "Bench East", icon: "users", color: "info", lead: "anika", people: ["anika", "ben"] }] },
  { name: "Marketing", icon: "rocket", color: "secondary", lead: "sarah", people: ["sarah"], teams: [{ name: "Talent Marketing", icon: "lightbulb", color: "warning", lead: "omar", people: ["omar"] }] },
  { name: "HR", icon: "users", color: "info", lead: "hana", people: ["hana"], teams: [{ name: "People Operations", icon: "heart", color: "danger", lead: "tomas", people: ["tomas"] }] },
  { name: "Finance", icon: "dollar", color: "success", lead: "felix", people: ["felix"], teams: [] },
  { name: "Operations", icon: "building", color: "neutral", lead: "eve", people: ["eve"], teams: [] },
];

const clone = (o) => JSON.parse(JSON.stringify(o));
const initials = (n) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("") || "?";

export function createGroupsMock({ json, withBody, subOf }) {
  let people;
  let groups;
  let nextId;
  const reset = () => {
    const roster = demoPeople("acme.localhost");
    people = roster.map((p, i) => ({ id: 100 + i, key: p.key, name: p.name, status: p.status, roleName: ROLE_NAMES[p.roles[0]] ?? p.roles[0], departmentId: null, teamId: null }));
    groups = [];
    nextId = 10;
    const byKey = (k) => people.find((p) => p.key === k);
    const add = (g) => {
      const row = { id: nextId++, name: g.name, kind: g.kind, sortOrder: groups.length, parentGroupId: g.parent ?? null, leadMemberId: g.lead ? byKey(g.lead)?.id ?? null : null, status: "ACTIVE", icon: g.icon, color: g.color, version: 0, createdAt: new Date(Date.now() - (60 - groups.length * 3) * 864e5).toISOString() };
      groups.push(row);
      return row;
    };
    for (const d of STRUCTURE) {
      const dept = add({ ...d, kind: "DEPARTMENT" });
      for (const k of d.people) if (byKey(k)) byKey(k).departmentId = dept.id;
      for (const t of d.teams) {
        const team = add({ ...t, kind: "TEAM", parent: dept.id });
        for (const k of t.people) {
          const p = byKey(k);
          if (p) {
            p.teamId = team.id;
            p.departmentId = dept.id;
          }
        }
      }
    }
  };
  reset();

  const problem = (res, status, code, message, extra = {}) => json(res, status, { status, code, title: code, detail: message, message, ...extra });
  const notFound = (res) => problem(res, 404, "NOT_FOUND", "Not found");
  const etag = (g) => `W/"${g.version}"`;
  const live = (p) => p.status !== "LEFT" && p.status !== "REMOVED";
  const person = (p) => (p ? { memberId: p.id, name: p.name, initials: initials(p.name), roleName: p.roleName } : null);
  const seatsIn = (g) => people.filter((p) => live(p) && (g.kind === "TEAM" ? p.teamId === g.id : g.kind === "DEPARTMENT" ? p.departmentId === g.id : false));
  const card = (g) => {
    const seats = seatsIn(g);
    const active = seats.filter((p) => p.status === "ACTIVE");
    const parent = groups.find((x) => x.id === g.parentGroupId);
    return {
      id: g.id, name: g.name, kind: g.kind, sortOrder: g.sortOrder, memberCount: seats.length, parentGroupId: g.parentGroupId, parentName: parent?.name ?? null,
      leadMemberId: g.leadMemberId, lead: person(people.find((p) => p.id === g.leadMemberId)), status: g.status, icon: g.icon, color: g.color, version: etag(g), createdAt: g.createdAt,
      activeCount: active.length, teamCount: g.kind === "DEPARTMENT" ? groups.filter((x) => x.parentGroupId === g.id && x.kind === "TEAM").length : null, memberPreview: active.slice(0, 4).map(person),
    };
  };
  const bump = (g) => {
    g.version += 1;
  };

  function summary() {
    const activeGroups = groups.filter((g) => g.status === "ACTIVE");
    const depts = activeGroups.filter((g) => g.kind === "DEPARTMENT");
    const teams = activeGroups.filter((g) => g.kind === "TEAM");
    const activePeople = people.filter((p) => p.status === "ACTIVE");
    const inTeams = new Set(teams.flatMap((t) => seatsIn(t).filter((p) => p.status === "ACTIVE").map((p) => p.id)));
    const sum = teams.reduce((n, t) => n + seatsIn(t).filter((p) => p.status === "ACTIVE").length, 0);
    return {
      departments: depts.length, teams: teams.length, employees: activePeople.length, teamMembers: inTeams.size, unplaced: activePeople.filter((p) => p.departmentId == null).length,
      departmentLeads: new Set(depts.map((d) => d.leadMemberId).filter(Boolean)).size, teamLeads: new Set(teams.map((d) => d.leadMemberId).filter(Boolean)).size,
      averageTeamSize: teams.length === 0 ? null : Math.round((sum * 10) / teams.length) / 10, inactive: groups.filter((g) => g.status === "INACTIVE" && g.kind !== "COHORT").length,
    };
  }

  const checkVersion = (req, res, g) => {
    const h = req.headers["if-match"];
    if (!h) return problem(res, 428, "PRECONDITION_REQUIRED", "Send the version you loaded in an If-Match header"), false;
    if (h.replace(/^W\//, "").replace(/"/g, "") !== String(g.version)) return problem(res, 412, "PRECONDITION_FAILED", "This group changed since you loaded it", { currentVersion: etag(g) }), false;
    return true;
  };
  const activeLead = (id) => people.find((p) => p.id === id && p.status === "ACTIVE");

  function apply(res, g, b, isNew) {
    if (b.name !== undefined) {
      const name = String(b.name).replace(/\s+/g, " ").trim();
      if (!name) return problem(res, 422, "ORG_INVALID", "name: is required", { field: "name" }), false;
      if (name.length > 80) return problem(res, 422, "ORG_INVALID", "name: must be at most 80 characters", { field: "name" }), false;
      if (groups.some((x) => x.id !== g.id && x.name.toLowerCase() === name.toLowerCase())) return problem(res, 409, "GROUP_NAME_TAKEN", `A group named '${name}' already exists`, { name }), false;
      g.name = name;
    }
    if (b.icon !== undefined) {
      if (!ICONS.includes(b.icon)) return problem(res, 422, "ORG_INVALID", "icon: is not one of the available icons", { field: "icon" }), false;
      g.icon = b.icon;
    }
    if (b.color !== undefined) {
      if (!COLORS.includes(b.color)) return problem(res, 422, "ORG_INVALID", "color: is not one of the available colours", { field: "color" }), false;
      g.color = b.color;
    }
    if (b.status !== undefined) {
      if (!["ACTIVE", "INACTIVE"].includes(b.status)) return problem(res, 422, "ORG_INVALID", "status: must be ACTIVE or INACTIVE", { field: "status" }), false;
      g.status = b.status;
    }
    if (b.parentGroupId != null) {
      const parent = groups.find((x) => x.id === b.parentGroupId);
      if (g.kind !== "TEAM" || !parent || parent.kind !== "DEPARTMENT" || parent.id === g.id) return problem(res, 422, "GROUP_PARENT_INVALID", "A team can only sit under a department", { field: "parentGroupId" }), false;
      if (g.parentGroupId !== parent.id) {
        const old = g.parentGroupId;
        g.parentGroupId = parent.id;
        for (const p of seatsIn(g)) if (p.departmentId == null || p.departmentId === old) p.departmentId = parent.id;
      }
    } else if (b.clearParent && g.parentGroupId != null) {
      const old = g.parentGroupId;
      g.parentGroupId = null;
      for (const p of seatsIn(g)) if (p.departmentId === old) p.departmentId = null;
    }
    if (b.leadMemberId != null) {
      if (!activeLead(b.leadMemberId)) return problem(res, 422, "LEAD_NOT_ACTIVE", "The lead must be an active member of this organization", { field: "leadMemberId" }), false;
      g.leadMemberId = b.leadMemberId;
    } else if (b.clearLead) g.leadMemberId = null;
    if (!isNew) bump(g);
    return true;
  }

  return function handle(req, res, path, method) {
    if (path === "/mock/groups/reset" && method === "POST") {
      req.resume();
      reset();
      return json(res, 200, { ok: true }), true;
    }
    const m = /^\/api\/orgs\/(\d+)\/groups(?:\/(directory|structure|pickers|people|\d+))?(?:\/members(?:\/(\d+))?)?$/.exec(path);
    if (!m) return false;
    const sub = subOf(req);
    if (Number(m[1]) !== ACME_ORG_ID || !sub || !READ.has(sub)) return notFound(res), true;
    const manage = MANAGE.has(sub);
    const seg = m[2];
    const url = new URL(req.url, "http://x");
    const hasMembers = path.includes("/members");

    if (!seg) {
      if (method === "GET") return json(res, 200, groups.map(card)), true;
      if (method === "POST") {
        if (!manage) return notFound(res), true;
        withBody(req, (b) => {
          const g = { id: nextId++, name: "", kind: b.kind ?? "TEAM", sortOrder: groups.length, parentGroupId: null, leadMemberId: null, status: "ACTIVE", icon: null, color: null, version: 0, createdAt: new Date().toISOString() };
          if (!b.name || !String(b.name).trim()) return problem(res, 422, "ORG_INVALID", "name: is required", { field: "name" });
          if (!["DEPARTMENT", "TEAM", "COHORT"].includes(g.kind)) return json(res, 400, { status: 400, title: "Bad Request", detail: "Invalid kind" });
          if (g.kind !== "TEAM" && b.parentGroupId != null) return problem(res, 422, "GROUP_PARENT_INVALID", "Only a team can sit under a department", { field: "parentGroupId" });
          if (!apply(res, g, { ...b, parentGroupId: g.kind === "TEAM" ? b.parentGroupId : undefined }, true)) return;
          groups.push(g);
          res.setHeader("ETag", etag(g));
          return json(res, 201, card(g));
        });
        return true;
      }
      return false;
    }

    if (seg === "pickers" && method === "GET") return json(res, 200, { icons: [...ICONS].sort(), colors: [...COLORS].sort() }), true;

    if (seg === "people" && method === "GET") {
      const q = (url.searchParams.get("q") ?? "").toLowerCase();
      const out = people
        .filter((p) => p.status === "ACTIVE" && p.name.toLowerCase().includes(q))
        .map((p) => ({ ...person(p), departmentName: groups.find((g) => g.id === p.departmentId)?.name ?? null, teamName: groups.find((g) => g.id === p.teamId)?.name ?? null }))
        .slice(0, 20);
      return json(res, 200, out), true;
    }

    if (seg === "structure" && method === "GET") {
      const cards = groups.map(card);
      return json(res, 200, {
        organizationName: "Acme Staffing",
        employees: people.filter((p) => p.status === "ACTIVE").length,
        departments: cards.filter((c) => c.kind === "DEPARTMENT").map((d) => ({ group: d, teams: cards.filter((t) => t.kind === "TEAM" && t.parentGroupId === d.id) })),
        unassignedTeams: cards.filter((c) => c.kind === "TEAM" && c.parentGroupId == null),
        cohorts: cards.filter((c) => c.kind === "COHORT"),
      }), true;
    }

    if (seg === "directory" && method === "GET") {
      const kind = url.searchParams.get("kind");
      const dep = url.searchParams.get("departmentId");
      const st = url.searchParams.get("status");
      const q = (url.searchParams.get("q") ?? "").toLowerCase();
      const sort = url.searchParams.get("sort") ?? "name";
      const desc = url.searchParams.get("dir") === "desc";
      let rows = groups.map(card).filter((c) => (!kind || c.kind === kind) && (!dep || String(c.parentGroupId) === dep) && (!st || c.status === st) && (!q || c.name.toLowerCase().includes(q) || (c.lead?.name.toLowerCase().includes(q) ?? false)));
      const key = { members: (c) => c.activeCount, created: (c) => c.createdAt, lead: (c) => (c.lead ? c.lead.name.toLowerCase() : "￿"), department: (c) => (c.parentName ? c.parentName.toLowerCase() : "￿") }[sort] ?? ((c) => c.name.toLowerCase());
      rows.sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : a.name.localeCompare(b.name)));
      if (desc) rows.reverse();
      const size = Math.max(1, Math.min(100, Number(url.searchParams.get("size") ?? 10) || 10));
      const page = Math.max(0, Number(url.searchParams.get("page") ?? 0) || 0);
      return json(res, 200, { items: rows.slice(page * size, page * size + size), page, size, total: rows.length, summary: summary() }), true;
    }

    const id = Number(seg);
    const g = groups.find((x) => x.id === id);
    if (!g) return notFound(res), true;

    if (hasMembers) {
      if (!manage) return notFound(res), true;
      if (method === "POST") {
        withBody(req, (b) => {
          if (!Array.isArray(b.memberIds) || b.memberIds.length === 0) return problem(res, 422, "ORG_INVALID", "memberIds: is required", { field: "memberIds" });
          if (g.status === "INACTIVE") return problem(res, 409, "GROUP_INACTIVE", `${g.name} is inactive`);
          const results = [];
          for (const mid of [...new Set(b.memberIds)]) {
            const p = people.find((x) => x.id === mid);
            if (!p || !live(p)) {
              results.push({ memberId: mid, status: "SKIPPED", code: "NOT_FOUND" });
              continue;
            }
            const before = `${p.teamId}|${p.departmentId}`;
            if (g.kind === "TEAM") {
              p.teamId = g.id;
              if (g.parentGroupId != null) p.departmentId = g.parentGroupId;
            } else if (g.kind === "DEPARTMENT") {
              p.departmentId = g.id;
              const t = groups.find((x) => x.id === p.teamId);
              if (t && t.parentGroupId !== g.id) p.teamId = null;
            }
            results.push({ memberId: mid, status: before === `${p.teamId}|${p.departmentId}` ? "UNCHANGED" : "MOVED", code: null });
          }
          const count = (s) => results.filter((r) => r.status === s).length;
          return json(res, 200, { groupId: g.id, moved: count("MOVED"), unchanged: count("UNCHANGED"), skipped: count("SKIPPED"), results });
        });
        return true;
      }
      if (method === "DELETE" && m[3]) {
        const p = people.find((x) => x.id === Number(m[3]));
        if (!p || !live(p)) return notFound(res), true;
        if (g.kind === "TEAM" && p.teamId === g.id) p.teamId = null;
        if (g.kind === "DEPARTMENT") {
          if (p.departmentId === g.id) p.departmentId = null;
          const t = groups.find((x) => x.id === p.teamId);
          if (t && t.parentGroupId === g.id) p.teamId = null;
        }
        res.statusCode = 204;
        return res.end(), true;
      }
      return false;
    }

    if (method === "GET") {
      const seats = seatsIn(g).sort((a, b) => Number(b.id === g.leadMemberId) - Number(a.id === g.leadMemberId) || a.id - b.id);
      const rows = seats.slice(0, 200).map((p) => ({
        memberId: p.id, name: p.name, initials: initials(p.name), status: p.status, roleName: p.roleName, lead: p.id === g.leadMemberId,
        departmentName: groups.find((x) => x.id === p.departmentId)?.name ?? null, teamName: groups.find((x) => x.id === p.teamId)?.name ?? null,
      }));
      res.setHeader("ETag", etag(g));
      return json(res, 200, { group: card(g), teams: g.kind === "DEPARTMENT" ? groups.filter((x) => x.parentGroupId === g.id).map(card) : [], members: rows, membersTotal: seats.length }), true;
    }
    if (!manage) return notFound(res), true;
    if (method === "PATCH") {
      withBody(req, (b) => {
        if (!checkVersion(req, res, g)) return;
        if (apply(res, g, b, false)) {
          res.setHeader("ETag", etag(g));
          return json(res, 200, card(g));
        }
      });
      return true;
    }
    if (method === "DELETE") {
      if (!checkVersion(req, res, g)) return true;
      const placed = seatsIn(g).length;
      const teams = groups.filter((x) => x.parentGroupId === g.id).length;
      if (placed + teams > 0) return problem(res, 409, "GROUP_NOT_EMPTY", `Move the people and teams out of ${g.name} first`, { count: placed + teams, members: placed, teams }), true;
      groups = groups.filter((x) => x.id !== g.id);
      res.statusCode = 204;
      return res.end(), true;
    }
    return false;
  };
}

export const SEED_STRUCTURE = clone(STRUCTURE);

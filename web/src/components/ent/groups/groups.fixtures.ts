import { vi } from "vitest";
import type { DirectoryPage, Group, GroupDetail, Structure, Summary, PersonOption } from "@/lib/ent/groups";

/** Test fixtures and a stand-in for the groups BFF, shared by the Departments and Teams page tests. */

export const person = (id: number, name: string, roleName = "Consultant") => ({ memberId: id, name, initials: name.split(" ").map((w) => w[0]).join(""), roleName });

export function group(over: Partial<Group> & Pick<Group, "id" | "name" | "kind">): Group {
  return {
    sortOrder: 0,
    memberCount: 0,
    parentGroupId: null,
    parentName: null,
    leadMemberId: null,
    lead: null,
    status: "ACTIVE",
    icon: "briefcase",
    color: "primary",
    version: 'W/"0"',
    createdAt: "2026-09-01T09:00:00Z",
    activeCount: 0,
    teamCount: over.kind === "DEPARTMENT" ? 0 : null,
    memberPreview: [],
    ...over,
  };
}

export const CONSULTING = group({ id: 11, name: "Consulting", kind: "DEPARTMENT", memberCount: 3, activeCount: 3, leadMemberId: 1, lead: person(1, "Amara Silva", "Account Manager"), teamCount: 1, memberPreview: [person(1, "Amara Silva"), person(2, "Anika Rao")] });
export const MARKETING = group({ id: 12, name: "Marketing", kind: "DEPARTMENT", icon: "rocket", color: "secondary", memberCount: 0, activeCount: 0 });
export const BENCH = group({ id: 21, name: "Bench East", kind: "TEAM", icon: "users", color: "info", parentGroupId: 11, parentName: "Consulting", memberCount: 2, activeCount: 2, leadMemberId: 2, lead: person(2, "Anika Rao"), memberPreview: [person(2, "Anika Rao"), person(3, "Ben Okafor")] });

export const SUMMARY: Summary = { departments: 2, teams: 1, employees: 9, teamMembers: 2, unplaced: 4, departmentLeads: 1, teamLeads: 1, averageTeamSize: 2, inactive: 0 };

export const STRUCTURE: Structure = {
  organizationName: "Acme Staffing",
  employees: 9,
  departments: [
    { group: CONSULTING, teams: [BENCH] },
    { group: MARKETING, teams: [] },
  ],
  unassignedTeams: [],
  cohorts: [],
};

export const PEOPLE: PersonOption[] = [
  { memberId: 1, name: "Amara Silva", initials: "AS", roleName: "Account Manager", departmentName: "Consulting", teamName: null },
  { memberId: 4, name: "Hana Petrov", initials: "HP", roleName: "HR Specialist", departmentName: null, teamName: null },
];

export function directory(kind: "DEPARTMENT" | "TEAM", over: Partial<DirectoryPage> = {}): DirectoryPage {
  const items = kind === "DEPARTMENT" ? [CONSULTING, MARKETING] : [BENCH];
  return { items, page: 0, size: 5, total: items.length, summary: SUMMARY, ...over };
}

export const detailOf = (g: Group): GroupDetail => ({ group: g, teams: g.kind === "DEPARTMENT" ? [BENCH] : [], members: [{ memberId: 2, name: "Anika Rao", initials: "AR", status: "ACTIVE", roleName: "Consultant", lead: g.id === 21, departmentName: "Consulting", teamName: "Bench East" }], membersTotal: 1 });

export type Call = { method: string; url: string; body: Record<string, unknown> | null; headers: Record<string, string> };

/**
 * Stubs `fetch` for `/api/orgs/{id}/groups/**`: records every call and answers with `answer(call)` (return null to use the defaults:
 * the directory, the structure, people, detail, and 200/201 for writes).
 */
export function stubGroupsFetch(opts: { structure?: Structure; dir?: (kind: string) => DirectoryPage; answer?: (c: Call) => { status: number; body: unknown } | null } = {}) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const raw = init.body;
      const call: Call = { method: init.method ?? "GET", url, body: typeof raw === "string" ? JSON.parse(raw) : null, headers: (init.headers ?? {}) as Record<string, string> };
      calls.push(call);
      const custom = opts.answer?.(call);
      let r: { status: number; body: unknown };
      if (custom) r = custom;
      else if (call.method === "GET" && url.includes("/groups/directory")) r = { status: 200, body: (opts.dir ?? ((k) => directory(k as "DEPARTMENT" | "TEAM")))(new URL(url, "http://x").searchParams.get("kind") ?? "DEPARTMENT") };
      else if (call.method === "GET" && url.includes("/groups/structure")) r = { status: 200, body: opts.structure ?? STRUCTURE };
      else if (call.method === "GET" && url.includes("/groups/people")) r = { status: 200, body: PEOPLE };
      else if (call.method === "GET") {
        const id = Number(url.split("/groups/")[1]);
        const all = [...(opts.structure ?? STRUCTURE).departments.flatMap((d) => [d.group, ...d.teams])];
        const g = all.find((x) => x.id === id) ?? CONSULTING;
        r = { status: 200, body: detailOf(g) };
      } else if (call.method === "POST" && url.endsWith("/members")) r = { status: 200, body: { groupId: 1, moved: (call.body?.memberIds as number[]).length, unchanged: 0, skipped: 0, results: [] } };
      else if (call.method === "POST") r = { status: 201, body: { ...CONSULTING, id: 99, name: String(call.body?.name ?? "New"), version: 'W/"0"' } };
      else if (call.method === "PATCH") r = { status: 200, body: { ...CONSULTING, version: 'W/"1"' } };
      else r = { status: 204, body: undefined };
      return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body ?? {} } as Response;
    }),
  );
  return calls;
}

import { serverApiFetch } from "@/lib/api";
import { notFound, orgPath } from "@/lib/ent/invitations-bff";

/**
 * GET /api/orgs/{orgId}/invitations/form-options: what the invite form offers, in one call. Roles come from `GET roles` (the
 * assignable ones: the OWNER template is never offered) and departments and teams from `GET groups` (kind DEPARTMENT / TEAM) and the optional manager choices from the active members. Either may be refused
 * (roles flag off, no `member.view_summary`): the form then says so instead of failing, and the API still checks the final invite.
 */
type Role = { id?: unknown; key?: unknown; name?: unknown; description?: unknown };
type Group = { id?: unknown; name?: unknown; kind?: unknown; parentGroupId?: unknown };
type Person = { id?: unknown; name?: unknown };

async function json(path: string): Promise<unknown | null> {
  try {
    const res = await serverApiFetch(path);
    return res.ok ? await res.json().catch(() => null) : null;
  } catch {
    return null;
  }
}

export async function GET(_req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  if (!orgPath(orgId)) return notFound();
  const [roles, groups, people] = await Promise.all([json(`/api/orgs/${orgId}/roles`), json(`/api/orgs/${orgId}/groups`), json(`/api/orgs/${orgId}/members?status=ACTIVE&size=100&sort=name,asc`)]);
  const peopleList = people && typeof people === "object" && Array.isArray((people as { items?: unknown }).items) ? ((people as { items: Person[] }).items) : [];
  const roleList = Array.isArray(roles) ? (roles as Role[]) : [];
  const groupList = Array.isArray(groups) ? (groups as Group[]) : [];
  return Response.json({
    roles: roleList
      .filter((r) => typeof r.id === "number" && typeof r.name === "string" && r.key !== "OWNER")
      .map((r) => ({ id: r.id, key: r.key, name: r.name, description: typeof r.description === "string" ? r.description : null })),
    departments: groupList.filter((g) => g.kind === "DEPARTMENT" && typeof g.id === "number" && typeof g.name === "string").map((g) => ({ id: g.id, name: g.name })),
    teams: groupList
      .filter((g) => g.kind === "TEAM" && typeof g.id === "number" && typeof g.name === "string")
      .map((g) => ({ id: g.id, name: g.name, parentGroupId: typeof g.parentGroupId === "number" ? g.parentGroupId : null })),
    managers: peopleList.filter((m) => typeof m.id === "number" && typeof m.name === "string").map((m) => ({ memberId: m.id, name: m.name })),
    rolesAvailable: Array.isArray(roles),
    departmentsAvailable: Array.isArray(groups),
  });
}

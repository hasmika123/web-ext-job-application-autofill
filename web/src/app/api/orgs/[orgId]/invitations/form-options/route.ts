import { serverApiFetch } from "@/lib/api";
import { notFound, orgPath } from "@/lib/ent/invitations-bff";

/**
 * GET /api/orgs/{orgId}/invitations/form-options: what the invite form offers, in one call. Roles come from `GET roles` (the
 * assignable ones: the OWNER template is never offered) and departments from `GET groups` (kind DEPARTMENT). Either may be refused
 * (roles flag off, no `member.view_summary`): the form then says so instead of failing, and the API still checks the final invite.
 */
type Role = { id?: unknown; key?: unknown; name?: unknown; description?: unknown };
type Group = { id?: unknown; name?: unknown; kind?: unknown };

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
  const [roles, groups] = await Promise.all([json(`/api/orgs/${orgId}/roles`), json(`/api/orgs/${orgId}/groups`)]);
  const roleList = Array.isArray(roles) ? (roles as Role[]) : [];
  const groupList = Array.isArray(groups) ? (groups as Group[]) : [];
  return Response.json({
    roles: roleList
      .filter((r) => typeof r.id === "number" && typeof r.name === "string" && r.key !== "OWNER")
      .map((r) => ({ id: r.id, key: r.key, name: r.name, description: typeof r.description === "string" ? r.description : null })),
    departments: groupList.filter((g) => g.kind === "DEPARTMENT" && typeof g.id === "number" && typeof g.name === "string").map((g) => ({ id: g.id, name: g.name })),
    rolesAvailable: Array.isArray(roles),
    departmentsAvailable: Array.isArray(groups),
  });
}

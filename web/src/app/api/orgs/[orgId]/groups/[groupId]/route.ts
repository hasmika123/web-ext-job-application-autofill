import { forward } from "@/lib/resume-doc-proxy";
import { ORG_ID } from "@/lib/org-types";

const notFound = () => Response.json({ error: "Not found" }, { status: 404 });

/** DELETE /api/orgs/:orgId/groups/:groupId - remove a group (`groups.manage`); the undo of "add a group". */
export async function DELETE(_request: Request, ctx: { params: Promise<{ orgId: string; groupId: string }> }) {
  const { orgId, groupId } = await ctx.params;
  if (!ORG_ID.test(orgId) || !ORG_ID.test(groupId)) return notFound();
  return forward(`/api/orgs/${orgId}/groups/${groupId}`, { method: "DELETE" });
}

/** PATCH /api/orgs/:orgId/groups/:groupId `{name?, kind?, sortOrder?}` - rename or retype a group (`groups.manage`). */
export async function PATCH(request: Request, ctx: { params: Promise<{ orgId: string; groupId: string }> }) {
  const { orgId, groupId } = await ctx.params;
  if (!ORG_ID.test(orgId) || !ORG_ID.test(groupId)) return notFound();
  const raw = await request.text();
  if (!raw.trim()) return Response.json({ error: "Expected a JSON body." }, { status: 400 });
  return forward(`/api/orgs/${orgId}/groups/${groupId}`, { method: "PATCH", body: raw });
}

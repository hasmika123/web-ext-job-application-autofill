import { forwardDelete, groupsPath, isId, notFound } from "@/lib/ent/groups-bff";

/** DELETE: take one person out of the group. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ orgId: string; groupId: string; memberId: string }> }) {
  const { orgId, groupId, memberId } = await params;
  const p = groupsPath(orgId);
  if (!p || !isId(groupId) || !isId(memberId)) return notFound();
  return forwardDelete(`${p}/${groupId}/members/${memberId}`);
}

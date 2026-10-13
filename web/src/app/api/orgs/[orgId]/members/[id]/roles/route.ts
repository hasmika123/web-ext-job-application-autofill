import { ID_RX, MEMBER_ROLE_FIELDS, badBody, forward, notFound, onlyFields, orgBase, readObject } from "@/lib/ent/roles-bff";

/** PUT /api/orgs/{orgId}/members/{id}/roles: replace a member's roles ({ roleIds, primaryRoleId? }). */
export async function PUT(request: Request, { params }: { params: Promise<{ orgId: string; id: string }> }) {
  const { orgId, id } = await params;
  const b = orgBase(orgId);
  if (!b || !ID_RX.test(id)) return notFound();
  const body = await readObject(request);
  if (!body) return badBody("Send a JSON object.");
  const bad = onlyFields(body, MEMBER_ROLE_FIELDS);
  if (bad) return badBody(bad);
  return forward(`${b}/members/${id}/roles`, { method: "PUT", body: JSON.stringify(body) });
}

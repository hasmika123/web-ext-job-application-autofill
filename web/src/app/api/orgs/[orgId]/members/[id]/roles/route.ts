import { ID_RX, MEMBER_ROLE_FIELDS, badBody, forward, notFound, onlyFields, orgBase, readObject } from "@/lib/ent/roles-bff";
import { handle as handleMembers } from "@/lib/ent/members-bff";

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

/**
 * POST /api/orgs/{orgId}/members/bulk/roles: the Employees bulk role change. This folder (`[id]/roles`) is more specific than the
 * Employees catch-all, so Next routes `bulk/roles` here with id = "bulk"; hand it to the catch-all's handler.
 */
export async function POST(request: Request, { params }: { params: Promise<{ orgId: string; id: string }> }) {
  const { orgId, id } = await params;
  if (id !== "bulk") return notFound();
  return handleMembers(request, { params: Promise.resolve({ orgId, path: ["bulk", "roles"] }) });
}

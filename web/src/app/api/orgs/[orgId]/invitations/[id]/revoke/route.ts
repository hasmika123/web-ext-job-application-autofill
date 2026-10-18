import { forwardNoContent, idOk, notFound, orgPath } from "@/lib/ent/invitations-bff";

/** POST /api/orgs/{orgId}/invitations/{id}/revoke: the link stops working at once (the API answers 204; here `200 { ok: true }`). */
export async function POST(_req: Request, { params }: { params: Promise<{ orgId: string; id: string }> }) {
  const { orgId, id } = await params;
  const p = orgPath(orgId);
  return p && idOk(id) ? forwardNoContent(`${p}/${id}/revoke`, { method: "POST" }) : notFound();
}

import { forward, idOk, notFound, orgPath } from "@/lib/ent/invitations-bff";

/** POST /api/orgs/{orgId}/invitations/{id}/resend: a new one-time link, a fresh expiry. */
export async function POST(_req: Request, { params }: { params: Promise<{ orgId: string; id: string }> }) {
  const { orgId, id } = await params;
  const p = orgPath(orgId);
  return p && idOk(id) ? forward(`${p}/${id}/resend`, { method: "POST" }) : notFound();
}

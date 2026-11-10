import { forward, idsBody, notFound, orgPath } from "@/lib/ent/invitations-bff";

/** POST /api/orgs/{orgId}/invitations/bulk/revoke: up to 100 ids, one result per id. */
export async function POST(req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const p = orgPath((await params).orgId);
  if (!p) return notFound();
  const body = await idsBody(req);
  if (body instanceof Response) return body;
  return forward(`${p}/bulk/revoke`, { method: "POST", body: JSON.stringify(body) });
}

import { forward, inviteBody, listQuery, notFound, orgPath } from "@/lib/ent/invitations-bff";

/** GET /api/orgs/{orgId}/invitations: the filtered, paged list (X1.15). */
export async function GET(req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const p = orgPath((await params).orgId);
  return p ? forward(`${p}${listQuery(req.url)}`) : notFound();
}

/** POST /api/orgs/{orgId}/invitations: invite one person or a pasted list; one result row per entry. */
export async function POST(req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const p = orgPath((await params).orgId);
  if (!p) return notFound();
  const body = await inviteBody(req);
  if (body instanceof Response) return body;
  return forward(p, { method: "POST", body: JSON.stringify(body) });
}

import { forward } from "@/lib/resume-doc-proxy";
import { ORG_ID } from "@/lib/org-types";

const notFound = () => Response.json({ error: "Not found" }, { status: 404 });

/** GET /api/orgs/:orgId - the org, who the caller is in it, and `permissions[]`. Spring answers a generic 404 for an org the caller is not in. */
export async function GET(_request: Request, ctx: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await ctx.params;
  if (!ORG_ID.test(orgId)) return notFound();
  return forward(`/api/orgs/${orgId}`);
}

/** PATCH /api/orgs/:orgId - profile fields and the typed settings bag (OWNER / ADMIN; Spring validates). */
export async function PATCH(request: Request, ctx: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await ctx.params;
  if (!ORG_ID.test(orgId)) return notFound();
  const raw = await request.text();
  if (!raw.trim()) return Response.json({ error: "Expected a JSON body." }, { status: 400 });
  return forward(`/api/orgs/${orgId}`, { method: "PATCH", body: raw });
}

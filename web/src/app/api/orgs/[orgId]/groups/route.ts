import { forward } from "@/lib/resume-doc-proxy";
import { ORG_ID } from "@/lib/org-types";

const notFound = () => Response.json({ error: "Not found" }, { status: 404 });

/** GET /api/orgs/:orgId/groups - departments, cohorts and teams with their seat counts (`member.view_summary`). */
export async function GET(_request: Request, ctx: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await ctx.params;
  if (!ORG_ID.test(orgId)) return notFound();
  return forward(`/api/orgs/${orgId}/groups`);
}

/** POST /api/orgs/:orgId/groups `{name, kind?}` - add one (`groups.manage`). Spring answers 409 `GROUP_NAME_TAKEN`, 422 `ORG_LIMIT_REACHED` / `SENSITIVE_CONTENT`. */
export async function POST(request: Request, ctx: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await ctx.params;
  if (!ORG_ID.test(orgId)) return notFound();
  const raw = await request.text();
  if (!raw.trim()) return Response.json({ error: "Expected a JSON body." }, { status: 400 });
  return forward(`/api/orgs/${orgId}/groups`, { method: "POST", body: raw });
}

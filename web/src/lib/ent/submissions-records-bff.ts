import { forward } from "@/lib/admin-proxy";

/**
 * The BFF half of the Accounts Submissions page (records only): `GET /api/orgs/{orgId}/submissions` and `/counts`. There is no write route here or in the API:
 * the consultant submits, the marketer records the fact on the Marketing workspace, Kiwiply never submits. Anything else is a 404 from this layer.
 */
export const orgOk = (orgId: string): boolean => /^\d{1,18}$/.test(orgId);
export const notFound = () => Response.json({ error: "Not found." }, { status: 404 });

export async function handle(request: Request, ctx: { params: Promise<{ orgId: string; path?: string[] }> }): Promise<Response> {
  const { orgId, path } = await ctx.params;
  if (!orgOk(orgId)) return notFound();
  const rest = (path ?? []).join("/");
  if (request.method !== "GET" || !(rest === "" || rest === "counts")) return notFound();
  const url = new URL(request.url);
  return forward(`/api/orgs/${orgId}/submissions${rest ? `/${rest}` : ""}${url.search}`, { method: "GET" });
}

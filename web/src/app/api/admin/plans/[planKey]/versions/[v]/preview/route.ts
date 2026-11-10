import { forward } from "@/lib/admin-proxy";
import { notFound, pickQuery, PLAN_KEY, VERSION_NO } from "@/lib/admin-plans-bff";

/** GET - the server-computed preview of a version (`interval`, `currency`, `roster`); the web renders it and computes nothing. */
export async function GET(request: Request, { params }: { params: Promise<{ planKey: string; v: string }> }) {
  const { planKey, v } = await params;
  if (!PLAN_KEY.test(planKey) || !VERSION_NO.test(v)) return notFound();
  return forward(`/api/admin/plans/${planKey}/versions/${v}/preview${pickQuery(request, ["interval", "currency", "roster"])}`);
}

import { forward } from "@/lib/admin-proxy";
import { notFound, pickQuery, PLAN_KEY } from "@/lib/admin-plans-bff";

/** GET ?version=&page=&size= - counts per version for everyone; the roster of one version when `version` is given (admin only). */
export async function GET(request: Request, { params }: { params: Promise<{ planKey: string }> }) {
  const { planKey } = await params;
  if (!PLAN_KEY.test(planKey)) return notFound();
  return forward(`/api/admin/plans/${planKey}/subscribers${pickQuery(request, ["version", "page", "size"])}`);
}

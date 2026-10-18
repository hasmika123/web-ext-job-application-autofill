import { forward } from "@/lib/admin-proxy";
import { notFound, PLAN_KEY, VERSION_NO } from "@/lib/admin-plans-bff";

/** POST - discard a DRAFT version (`{ reason? }`). 204 on success. */
export async function POST(request: Request, { params }: { params: Promise<{ planKey: string; v: string }> }) {
  const { planKey, v } = await params;
  if (!PLAN_KEY.test(planKey) || !VERSION_NO.test(v)) return notFound();
  const body: unknown = await request.json().catch(() => ({}));
  const reason = body && typeof body === "object" && typeof (body as { reason?: unknown }).reason === "string" ? (body as { reason: string }).reason : undefined;
  return forward(`/api/admin/plans/${planKey}/versions/${v}/discard`, { method: "POST", body: JSON.stringify({ reason }) });
}

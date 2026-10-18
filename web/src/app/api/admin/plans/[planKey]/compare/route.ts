import { forward } from "@/lib/admin-proxy";
import { notFound, pickQuery, PLAN_KEY } from "@/lib/admin-plans-bff";

/** GET ?a=&b= - two versions side by side: differences, subscribers of each, worst-case margin per interval. */
export async function GET(request: Request, { params }: { params: Promise<{ planKey: string }> }) {
  const { planKey } = await params;
  if (!PLAN_KEY.test(planKey)) return notFound();
  const sp = new URL(request.url).searchParams;
  if (!/^\d{1,6}$/.test(sp.get("a") ?? "") || !/^\d{1,6}$/.test(sp.get("b") ?? "")) return Response.json({ error: "Pick two versions to compare." }, { status: 400 });
  return forward(`/api/admin/plans/${planKey}/compare${pickQuery(request, ["a", "b"])}`);
}

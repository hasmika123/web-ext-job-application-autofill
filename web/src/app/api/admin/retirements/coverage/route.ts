import { forward } from "@/lib/admin-proxy";
import { notFound, pickQuery, PLAN_KEY } from "@/lib/admin-plans-bff";

/** GET ?planKey=&successors=A,B - impact of retiring the plan, per-successor coverage and the would-pay-more counts, plus the wizard's defaults (all server computed). */
export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams;
  if (!PLAN_KEY.test(sp.get("planKey") ?? "")) return notFound();
  const successors = sp.get("successors");
  if (successors && !successors.split(",").every((k) => PLAN_KEY.test(k))) return Response.json({ error: "Successors are plan keys." }, { status: 400 });
  return forward(`/api/admin/retirements/coverage${pickQuery(request, ["planKey", "successors"])}`);
}

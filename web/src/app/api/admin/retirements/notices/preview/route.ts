import { forward } from "@/lib/admin-proxy";
import { notFound, pickQuery, PLAN_KEY } from "@/lib/admin-plans-bff";

/** GET ?planKey=&outcome=&successor=&message= - the first notice, rendered from the copy register (11 section 4.2) for a sample subscriber. */
export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams;
  if (!PLAN_KEY.test(sp.get("planKey") ?? "")) return notFound();
  return forward(`/api/admin/retirements/notices/preview${pickQuery(request, ["planKey", "outcome", "successor", "message"])}`);
}

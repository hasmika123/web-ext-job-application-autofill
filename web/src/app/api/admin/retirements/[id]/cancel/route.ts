import { forwardObject, notFound } from "@/lib/admin-plans-bff";

/** POST (HIGH: `reason`, `confirmPlanKey`) - cancel a retirement; the API refuses once any subscriber has acted (409 RETIREMENT_ACTED). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d{1,18}$/.test(id)) return notFound();
  return forwardObject(request, `/api/admin/retirements/${id}/cancel`, "POST", ["reason", "confirmPlanKey"]);
}

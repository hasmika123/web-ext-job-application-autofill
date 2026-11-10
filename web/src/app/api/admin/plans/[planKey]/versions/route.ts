import { forwardObject, notFound, PLAN_KEY } from "@/lib/admin-plans-bff";

/** POST /api/admin/plans/{planKey}/versions (HIGH: `reason`) - a new DRAFT copied from `from` (default: the live version). */
export async function POST(request: Request, { params }: { params: Promise<{ planKey: string }> }) {
  const { planKey } = await params;
  if (!PLAN_KEY.test(planKey)) return notFound();
  return forwardObject(request, `/api/admin/plans/${planKey}/versions`, "POST", ["from", "reason"]);
}

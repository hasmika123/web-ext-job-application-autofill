import { forward } from "@/lib/admin-proxy";
import { forwardObject, notFound, PLAN_KEY } from "@/lib/admin-plans-bff";

type Ctx = { params: Promise<{ planKey: string }> };

/** GET /api/admin/plans/{planKey} - the plan with all its versions. */
export async function GET(_request: Request, { params }: Ctx) {
  const { planKey } = await params;
  if (!PLAN_KEY.test(planKey)) return notFound();
  return forward(`/api/admin/plans/${planKey}`);
}

/** PUT /api/admin/plans/{planKey} (HIGH: `reason`) - name, description, badge, public, sortOrder, eligibility. Key and audience are immutable. */
export async function PUT(request: Request, { params }: Ctx) {
  const { planKey } = await params;
  if (!PLAN_KEY.test(planKey)) return notFound();
  return forwardObject(request, `/api/admin/plans/${planKey}`, "PUT", ["name", "description", "badge", "publicPlan", "sortOrder", "eligibility", "expectedUpdatedAt", "reason"]);
}

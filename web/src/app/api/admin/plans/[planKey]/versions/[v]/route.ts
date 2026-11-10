import { forward } from "@/lib/admin-proxy";
import { forwardObject, notFound, PLAN_KEY, VERSION_NO } from "@/lib/admin-plans-bff";

type Ctx = { params: Promise<{ planKey: string; v: string }> };

/** GET - one version, priced from the live catalog (DRAFT) or from its own snapshot (published). */
export async function GET(_request: Request, { params }: Ctx) {
  const { planKey, v } = await params;
  if (!PLAN_KEY.test(planKey) || !VERSION_NO.test(v)) return notFound();
  return forward(`/api/admin/plans/${planKey}/versions/${v}`);
}

/** PATCH - the autosave of a DRAFT version: intervals, annualDiscountBp, aiBudgetCapCents, aiWindows, baseProductId, seatRules, presets, summary. */
export async function PATCH(request: Request, { params }: Ctx) {
  const { planKey, v } = await params;
  if (!PLAN_KEY.test(planKey) || !VERSION_NO.test(v)) return notFound();
  return forwardObject(request, `/api/admin/plans/${planKey}/versions/${v}`, "PATCH", [
    "intervals",
    "annualDiscountBp",
    "aiBudgetCapCents",
    "aiWindows",
    "baseProductId",
    "seatRules",
    "presets",
    "summary",
    "expectedUpdatedAt",
  ]);
}

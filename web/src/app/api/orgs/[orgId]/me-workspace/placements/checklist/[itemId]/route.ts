import { placementCall } from "../../_bff/shared";

/** PUT .../placements/checklist/{itemId}: ticks or unticks one onboarding checklist item ({completed: boolean}). */
export async function PUT(request: Request, { params }: { params: Promise<{ orgId: string; itemId: string }> }) {
  return placementCall(params, "", { method: "PUT" }, request, "completed");
}

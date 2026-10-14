import { opportunitiesCall } from "../../_bff/shared";

/**
 * POST .../opportunities/{matchId}/{action}: express-interest, need-more-info, decline, reopen or request-resume-update (any other name is 404).
 * None of them creates an application or submits anything.
 */
export async function POST(request: Request, { params }: { params: Promise<{ orgId: string; matchId: string; action: string }> }) {
  return opportunitiesCall(params, { method: "POST" }, request);
}

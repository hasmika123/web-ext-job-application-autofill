import { matchesCall } from "../_bff/shared";

/** GET .../me-workspace/matches/{matchId}: match details and insights for one of the caller's own matches. */
export async function GET(_req: Request, { params }: { params: Promise<{ orgId: string; matchId: string }> }) {
  return matchesCall(params, "");
}

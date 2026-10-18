import { opportunitiesCall } from "../_bff/shared";

/** GET .../me-workspace/opportunities/{matchId}: details of one of the caller's own assigned opportunities. */
export async function GET(_req: Request, { params }: { params: Promise<{ orgId: string; matchId: string }> }) {
  return opportunitiesCall(params);
}

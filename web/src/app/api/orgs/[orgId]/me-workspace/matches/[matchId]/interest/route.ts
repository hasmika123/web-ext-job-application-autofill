import { matchesCall } from "../../_bff/shared";

/** POST .../matches/{matchId}/interest: Express Interest (records the wish; creates no application, submits nothing). */
export async function POST(request: Request, { params }: { params: Promise<{ orgId: string; matchId: string }> }) {
  return matchesCall(params, "/interest", { method: "POST" }, request);
}

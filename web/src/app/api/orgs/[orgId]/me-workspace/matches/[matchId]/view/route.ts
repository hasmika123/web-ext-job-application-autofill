import { matchesCall } from "../../_bff/shared";

/** POST .../matches/{matchId}/view: records that the consultant opened View Match. */
export async function POST(_req: Request, { params }: { params: Promise<{ orgId: string; matchId: string }> }) {
  return matchesCall(params, "/view", { method: "POST" });
}

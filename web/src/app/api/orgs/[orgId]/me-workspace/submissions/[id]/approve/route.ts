import { submissionsCall } from "../../_bff/shared";

/** POST .../submissions/{id}/approve: records the consultant's approval only; Kiwiply sends nothing to a client. */
export async function POST(_req: Request, { params }: { params: Promise<{ orgId: string; id: string }> }) {
  return submissionsCall(params, "/approve", { method: "POST" });
}

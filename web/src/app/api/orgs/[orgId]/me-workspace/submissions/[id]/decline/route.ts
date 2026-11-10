import { submissionsCall } from "../../_bff/shared";

/** POST .../submissions/{id}/decline: records the consultant's decline with a reason (the API scans it for sensitive data). */
export async function POST(request: Request, { params }: { params: Promise<{ orgId: string; id: string }> }) {
  return submissionsCall(params, "/decline", { method: "POST" }, request, { body: "reason" });
}

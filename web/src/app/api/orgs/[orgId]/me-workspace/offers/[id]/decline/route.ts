import { offersCall } from "../../_bff/shared";

/** POST .../offers/{id}/decline: records the consultant's decline with an optional reason (the API scans it for sensitive data). */
export async function POST(request: Request, { params }: { params: Promise<{ orgId: string; id: string }> }) {
  return offersCall(params, "/decline", { method: "POST" }, request, { body: "reason" });
}

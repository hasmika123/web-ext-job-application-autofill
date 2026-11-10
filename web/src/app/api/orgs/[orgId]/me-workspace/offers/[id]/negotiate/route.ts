import { offersCall } from "../../_bff/shared";

/** POST .../offers/{id}/negotiate: records the consultant's request to negotiate, with a note (the API scans it for sensitive data). */
export async function POST(request: Request, { params }: { params: Promise<{ orgId: string; id: string }> }) {
  return offersCall(params, "/negotiate", { method: "POST" }, request, { body: "note" });
}

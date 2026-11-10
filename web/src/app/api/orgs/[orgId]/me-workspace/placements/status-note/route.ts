import { placementCall } from "../_bff/shared";

/** POST .../placements/status-note: records a short status note ({note}) on the consultant's current placement (the API scans it for sensitive data). */
export async function POST(request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  return placementCall(params, "/status-note", { method: "POST" }, request, "note");
}

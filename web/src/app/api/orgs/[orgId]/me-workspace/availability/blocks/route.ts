import { sendBody } from "../_bff/shared";

/** POST /api/orgs/{orgId}/me-workspace/availability/blocks: add a calendar entry (the API owns the date rules, overlaps and the PII scanner). */
export async function POST(request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  return sendBody(request, params, "POST", "/blocks");
}

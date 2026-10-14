import { prepCall } from "../../_bff/shared";

/** GET .../interview-prep/sessions/{sessionId}: the stored notes and question scores of one of the caller's own sessions. */
export async function GET(_req: Request, { params }: { params: Promise<{ orgId: string; sessionId: string }> }) {
  return prepCall(params, "");
}

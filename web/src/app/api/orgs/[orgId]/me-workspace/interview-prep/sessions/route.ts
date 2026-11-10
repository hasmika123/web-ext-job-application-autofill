import { prepCall } from "../_bff/shared";

/** POST .../interview-prep/sessions: record a self-scored practice session (no AI scoring; notes are scanned by the API). */
export async function POST(request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  return prepCall(params, "/sessions", { method: "POST" }, request);
}

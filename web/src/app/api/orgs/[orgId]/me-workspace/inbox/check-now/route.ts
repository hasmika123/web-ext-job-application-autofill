import { forward } from "@/lib/admin-proxy";
import { inboxPath } from "../_bff/shared";

/**
 * POST /api/orgs/{orgId}/me-workspace/inbox/check-now  read the consultant's own Gmail straight away instead of waiting for the next 15-minute round.
 * The API answers 202 and reads in the background (reload the page to see the result), 409 when nothing is connected, 429 within a minute of the last
 * manual check. Nothing is sent, moved or deleted; only the consultant's own mailbox is read.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const p = inboxPath((await params).orgId, "/check-now");
  return p ? forward(p, { method: "POST", headers: { accept: "application/json" } }) : Response.json({ error: "Not found." }, { status: 404 });
}

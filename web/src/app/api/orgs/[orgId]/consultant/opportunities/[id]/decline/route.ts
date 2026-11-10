import { proxyAction } from "@/lib/ent/consultant-ws/opportunities-bff";

const DECLINE_FIELDS: readonly string[] = ["reason", "note"];

/** POST /api/orgs/{orgId}/consultant/opportunities/{id}/decline: The consultant declines, with a reason from the API's list. Forwards `Idempotency-Key` and `If-Match`. */
export async function POST(req: Request, { params }: { params: Promise<{ orgId: string; id: string }> }) {
  const { orgId, id } = await params;
  return proxyAction(req, orgId, id, "decline", DECLINE_FIELDS);
}

import { proxyAction } from "@/lib/ent/consultant-ws/opportunities-bff";

const INTEREST_FIELDS: readonly string[] = [];

/** POST /api/orgs/{orgId}/consultant/opportunities/{id}/interest: The consultant is interested. Forwards `Idempotency-Key` and `If-Match`. */
export async function POST(req: Request, { params }: { params: Promise<{ orgId: string; id: string }> }) {
  const { orgId, id } = await params;
  return proxyAction(req, orgId, id, "interest", INTEREST_FIELDS);
}

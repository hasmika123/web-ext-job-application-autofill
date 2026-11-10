import { proxyAction } from "@/lib/ent/consultant-ws/opportunities-bff";

const VIEWED_FIELDS: readonly string[] = [];

/** POST /api/orgs/{orgId}/consultant/opportunities/{id}/viewed: Record that the consultant looked at the job (explicit; never a GET side effect). Forwards `Idempotency-Key` and `If-Match`. */
export async function POST(req: Request, { params }: { params: Promise<{ orgId: string; id: string }> }) {
  const { orgId, id } = await params;
  return proxyAction(req, orgId, id, "viewed", VIEWED_FIELDS);
}

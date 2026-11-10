import { proxyAction } from "@/lib/ent/consultant-ws/opportunities-bff";

const UNLINK_FIELDS: readonly string[] = [];

/** POST /api/orgs/{orgId}/consultant/opportunities/{id}/unlink: Remove that link. Forwards `Idempotency-Key` and `If-Match`. */
export async function POST(req: Request, { params }: { params: Promise<{ orgId: string; id: string }> }) {
  const { orgId, id } = await params;
  return proxyAction(req, orgId, id, "unlink", UNLINK_FIELDS);
}

import { proxyAction } from "@/lib/ent/consultant-ws/opportunities-bff";

const APPLIED_FIELDS: readonly string[] = ["applicationId"];

/** POST /api/orgs/{orgId}/consultant/opportunities/{id}/applied: The consultant says they applied (E1: this only RECORDS it; nothing is submitted). Forwards `Idempotency-Key` and `If-Match`. */
export async function POST(req: Request, { params }: { params: Promise<{ orgId: string; id: string }> }) {
  const { orgId, id } = await params;
  return proxyAction(req, orgId, id, "applied", APPLIED_FIELDS);
}

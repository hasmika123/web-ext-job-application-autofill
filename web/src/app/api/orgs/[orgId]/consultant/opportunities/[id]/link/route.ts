import { proxyAction } from "@/lib/ent/consultant-ws/opportunities-bff";

const LINK_FIELDS: readonly string[] = ["applicationId"];

/** POST /api/orgs/{orgId}/consultant/opportunities/{id}/link: Link one of the consultant's own tracked applications to this job. Forwards `Idempotency-Key` and `If-Match`. */
export async function POST(req: Request, { params }: { params: Promise<{ orgId: string; id: string }> }) {
  const { orgId, id } = await params;
  return proxyAction(req, orgId, id, "link", LINK_FIELDS);
}

import { proxyAction } from "@/lib/ent/consultant-ws/opportunities-bff";

const REQUEST_INFO_FIELDS: readonly string[] = ["question"];

/** POST /api/orgs/{orgId}/consultant/opportunities/{id}/request-info: The consultant asks the marketer a question (the marketer gets a task). Forwards `Idempotency-Key` and `If-Match`. */
export async function POST(req: Request, { params }: { params: Promise<{ orgId: string; id: string }> }) {
  const { orgId, id } = await params;
  return proxyAction(req, orgId, id, "request-info", REQUEST_INFO_FIELDS);
}

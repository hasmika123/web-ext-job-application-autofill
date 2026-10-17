import { proxyPost } from "@/lib/ent/marketer-ws/opportunities-bff";

/** POST .../opportunities/{id}/reassign {consultantId}: a declined or withdrawn opportunity is offered to another consultant of the caller's scope. */
export async function POST(req: Request, { params }: { params: Promise<{ orgId: string; id: string }> }) {
  const { orgId, id } = await params;
  return proxyPost(orgId, "/reassign", id, req, ["consultantId", "confirmDuplicate", "duplicateReason"]);
}

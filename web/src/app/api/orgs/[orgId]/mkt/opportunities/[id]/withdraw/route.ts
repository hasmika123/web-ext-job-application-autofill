import { proxyPost } from "@/lib/ent/marketer-ws/opportunities-bff";

/** POST .../opportunities/{id}/withdraw {reason}: the marketer takes an assignment back (state CLOSED, reason WITHDRAWN). The consultant is told by the API. */
export async function POST(req: Request, { params }: { params: Promise<{ orgId: string; id: string }> }) {
  const { orgId, id } = await params;
  return proxyPost(orgId, "/withdraw", id, req, ["reason"]);
}

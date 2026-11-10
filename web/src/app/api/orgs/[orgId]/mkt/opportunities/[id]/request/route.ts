import { proxyPost } from "@/lib/ent/marketer-ws/opportunities-bff";

/** POST .../opportunities/{id}/request {kind: INTEREST|RESUME}: Follow Up. Asks the consultant; the consultant answers on their own workspace. */
export async function POST(req: Request, { params }: { params: Promise<{ orgId: string; id: string }> }) {
  const { orgId, id } = await params;
  return proxyPost(orgId, "/request", id, req, ["kind"]);
}

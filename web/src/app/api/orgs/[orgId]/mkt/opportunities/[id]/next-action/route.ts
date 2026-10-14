import { proxyPatch } from "@/lib/ent/marketer-ws/opportunities-bff";

/** PATCH .../opportunities/{id}/next-action {nextActionAt}: move or clear the next action date. */
export async function PATCH(req: Request, { params }: { params: Promise<{ orgId: string; id: string }> }) {
  const { orgId, id } = await params;
  return proxyPatch(orgId, "/next-action", id, req, ["nextActionAt"]);
}

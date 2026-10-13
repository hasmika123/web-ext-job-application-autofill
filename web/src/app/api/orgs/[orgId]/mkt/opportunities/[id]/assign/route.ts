import { proxyPost } from "@/lib/ent/marketer-ws/opportunities-bff";

/** POST .../opportunities/{id}/assign: suggested to assigned, then the consultant is asked for their interest. E1: never answers or submits for them. */
export async function POST(_req: Request, { params }: { params: Promise<{ orgId: string; id: string }> }) {
  const { orgId, id } = await params;
  return proxyPost(orgId, "/assign", id);
}

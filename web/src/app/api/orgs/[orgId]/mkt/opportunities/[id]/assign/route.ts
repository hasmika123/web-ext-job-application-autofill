import { proxyPost } from "@/lib/ent/marketer-ws/opportunities-bff";

/** POST .../opportunities/{id}/assign [{confirmDuplicate, duplicateReason}]: suggested to assigned, then the consultant is asked for their interest. E1: never answers or submits for them. */
export async function POST(req: Request, { params }: { params: Promise<{ orgId: string; id: string }> }) {
  const { orgId, id } = await params;
  // An optional body carries the answer to a duplicate warning: {confirmDuplicate, duplicateReason}. No body = a plain assign.
  return proxyPost(orgId, "/assign", id, req, ["confirmDuplicate", "duplicateReason"], true);
}

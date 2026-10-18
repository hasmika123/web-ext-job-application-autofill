import { proxyPost } from "@/lib/ent/marketer-ws/opportunities-bff";

/** POST .../opportunities/{id}/answer-info {answer}: the marketer answers the consultant's question. The consultant's own state never changes (E1). */
export async function POST(req: Request, { params }: { params: Promise<{ orgId: string; id: string }> }) {
  const { orgId, id } = await params;
  return proxyPost(orgId, "/answer-info", id, req, ["answer"]);
}

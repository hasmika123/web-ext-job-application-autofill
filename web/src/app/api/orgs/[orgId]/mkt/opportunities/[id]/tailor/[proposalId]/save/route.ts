import { notFound, proxyPost } from "@/lib/ent/marketer-ws/opportunities-bff";

/** POST .../opportunities/{id}/tailor/{proposalId}/save {keep, additions, label?}: save the kept changes as a new resume for the consultant (it waits for their approval). */
export async function POST(req: Request, { params }: { params: Promise<{ orgId: string; id: string; proposalId: string }> }) {
  const { orgId, id, proposalId } = await params;
  if (!/^\d{1,18}$/.test(proposalId)) return notFound();
  return proxyPost(orgId, `/tailor/${proposalId}/save`, id, req, ["keep", "additions", "label"]);
}

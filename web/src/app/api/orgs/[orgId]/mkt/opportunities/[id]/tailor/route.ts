import { proxyPost } from "@/lib/ent/marketer-ws/opportunities-bff";

/** POST .../opportunities/{id}/tailor {orgResumeId?}: AI tailors one of the consultant's resumes for this job (MKT-TAILOR-BUILD.md). Charges the consultant's AI budget. */
export async function POST(req: Request, { params }: { params: Promise<{ orgId: string; id: string }> }) {
  const { orgId, id } = await params;
  return proxyPost(orgId, "/tailor", id, req, ["orgResumeId"], true);
}

import { proxyPut } from "@/lib/ent/marketer-ws/opportunities-bff";

/** PUT .../opportunities/{id}/resume {orgResumeId}: choose which of the consultant's resumes goes with this job (null = their usual one). */
export async function PUT(req: Request, { params }: { params: Promise<{ orgId: string; id: string }> }) {
  const { orgId, id } = await params;
  return proxyPut(orgId, "/resume", id, req, ["orgResumeId"]);
}

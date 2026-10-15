import { forward } from "@/lib/admin-proxy";

/** GET .../mkt/resumes/consultants/{consultantId}/sources: counts from the consultant's profile and the resumes a copy can start from. */
export async function GET(_req: Request, { params }: { params: Promise<{ orgId: string; consultantId: string }> }) {
  const { orgId, consultantId } = await params;
  if (!/^\d{1,18}$/.test(orgId) || !/^\d{1,18}$/.test(consultantId)) return Response.json({ error: "Not found." }, { status: 404 });
  return forward(`/api/orgs/${orgId}/mkt/resumes/consultants/${consultantId}/sources`, { headers: { accept: "application/json" } });
}

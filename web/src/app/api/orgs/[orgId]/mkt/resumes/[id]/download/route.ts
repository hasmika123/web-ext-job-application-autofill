import { forward } from "@/lib/admin-proxy";

/** GET .../download: resumes are metadata only, so the API answers 404 NO_FILE_STORED with a message; the page shows the action disabled. */
export async function GET(_req: Request, { params }: { params: Promise<{ orgId: string; id: string }> }) {
  const { orgId, id } = await params;
  if (!/^\d{1,18}$/.test(orgId) || !/^\d{1,18}$/.test(id)) return Response.json({ error: "Not found." }, { status: 404 });
  return forward(`/api/orgs/${orgId}/mkt/resumes/${id}/download`, { headers: { accept: "application/json" } });
}

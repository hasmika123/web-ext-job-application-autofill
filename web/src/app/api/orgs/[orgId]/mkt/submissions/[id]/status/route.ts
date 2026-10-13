import { forwardBody, itemPath, notFound } from "@/lib/ent/marketer-ws/submissions-bff";

/** PATCH /api/orgs/{orgId}/mkt/submissions/{id}/status: record where the submission stands ({status, note?}); a fact, never an action on a client. */
export async function PATCH(request: Request, { params }: { params: Promise<{ orgId: string; id: string }> }) {
  const { orgId, id } = await params;
  const p = itemPath(orgId, id);
  return p ? forwardBody(request, `${p}/status`, "PATCH", ["status", "note"]) : notFound();
}

import { forwardBody, itemPath, notFound } from "@/lib/ent/marketer-ws/submissions-bff";

/** POST /api/orgs/{orgId}/mkt/submissions/{id}/approval: record the approver's decision ({decision: APPROVED|REJECTED, note?}). */
export async function POST(request: Request, { params }: { params: Promise<{ orgId: string; id: string }> }) {
  const { orgId, id } = await params;
  const p = itemPath(orgId, id);
  return p ? forwardBody(request, `${p}/approval`, "POST", ["decision", "note"]) : notFound();
}

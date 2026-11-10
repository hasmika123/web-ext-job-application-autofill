import { forward, itemPath, notFound } from "@/lib/ent/marketer-ws/submissions-bff";

/** POST /api/orgs/{orgId}/mkt/submissions/{id}/request-approval: ask the consultant/approver to approve the draft. Sends nothing to a client. */
export async function POST(_req: Request, { params }: { params: Promise<{ orgId: string; id: string }> }) {
  const { orgId, id } = await params;
  const p = itemPath(orgId, id);
  return p ? forward(`${p}/request-approval`, { method: "POST" }) : notFound();
}

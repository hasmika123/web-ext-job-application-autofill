import { basePath, forward, notFound } from "@/lib/ent/marketer-ws/submissions-bff";

/** DELETE /api/orgs/{orgId}/mkt/submissions/views/{viewId}: delete one of the caller's saved views. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ orgId: string; viewId: string }> }) {
  const { orgId, viewId } = await params;
  const p = basePath(orgId);
  if (!p || !/^\d{1,18}$/.test(viewId)) return notFound();
  return forward(`${p}/views/${viewId}`, { method: "DELETE" });
}

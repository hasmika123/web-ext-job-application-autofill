import { forward, notFound, orgPath, validKind } from "@/lib/ent/policies-bff";

/** POST /api/orgs/{orgId}/policies/{kind}/submit (BFF name): ask a reviewer to look at the draft for review. */
export async function POST(_req: Request, { params }: { params: Promise<{ orgId: string; kind: string }> }) {
  const { orgId, kind } = await params;
  const p = orgPath(orgId);
  return p && validKind(kind) ? forward(`${p}/${encodeURIComponent(kind)}/request-review`, { method: "POST" }) : notFound();
}

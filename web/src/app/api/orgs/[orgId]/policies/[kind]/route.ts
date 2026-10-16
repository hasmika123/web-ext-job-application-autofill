import { forward, notFound, orgPath, validKind } from "@/lib/ent/policies-bff";

/** GET /api/orgs/{orgId}/policies/{kind}: the draft, the live text and the history. */
export async function GET(_req: Request, { params }: { params: Promise<{ orgId: string; kind: string }> }) {
  const { orgId, kind } = await params;
  const p = orgPath(orgId);
  return p && validKind(kind) ? forward(`${p}/${encodeURIComponent(kind)}`) : notFound();
}

import { forward, notFound, orgPath, validKind } from "@/lib/ent/policies-bff";

/** POST /api/orgs/{orgId}/policies/{kind}/template: replace the draft with the neutral template. */
export async function POST(_req: Request, { params }: { params: Promise<{ orgId: string; kind: string }> }) {
  const { orgId, kind } = await params;
  const p = orgPath(orgId);
  return p && validKind(kind) ? forward(`${p}/${encodeURIComponent(kind)}/template`, { method: "POST" }) : notFound();
}

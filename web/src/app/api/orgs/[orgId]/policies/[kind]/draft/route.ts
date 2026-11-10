import { badBody, forward, notFound, orgPath, readObject, validKind } from "@/lib/ent/policies-bff";

/** PUT /api/orgs/{orgId}/policies/{kind}/draft: save the draft. `If-Match` is the draftVersion the editor last saw. */
export async function PUT(request: Request, { params }: { params: Promise<{ orgId: string; kind: string }> }) {
  const { orgId, kind } = await params;
  const p = orgPath(orgId);
  if (!p || !validKind(kind)) return notFound();
  const body = await readObject(request);
  if (!body || typeof body.body !== "string") return badBody("Send { body: text }.");
  const headers: Record<string, string> = {};
  const ifMatch = request.headers.get("if-match");
  if (ifMatch) headers["If-Match"] = ifMatch;
  return forward(`${p}/${encodeURIComponent(kind)}/draft`, { method: "PUT", body: JSON.stringify({ body: body.body }), headers });
}

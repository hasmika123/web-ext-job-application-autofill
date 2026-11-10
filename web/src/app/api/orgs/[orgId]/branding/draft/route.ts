import { badBody, forward, notFound, orgPath, readObject } from "@/lib/ent/branding-bff";

/** PATCH /api/orgs/{orgId}/branding/draft: the autosave target. `If-Match` is the draftVersion the editor last saw. */
export async function PATCH(request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const p = orgPath((await params).orgId);
  if (!p) return notFound();
  const body = await readObject(request);
  if (!body) return badBody("Send a JSON object.");
  const headers: Record<string, string> = {};
  const ifMatch = request.headers.get("if-match");
  if (ifMatch) headers["If-Match"] = ifMatch;
  return forward(`${p}/draft`, { method: "PATCH", body: JSON.stringify(body), headers });
}

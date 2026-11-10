import { forward } from "@/lib/resume-doc-proxy";

/**
 * POST /api/profile/items/import - body `{items:[{section, dataJson, provenance?, sourceResumeId?}],
 * bio?, provenanceBio?}` -> `{created, merged, updatedBio}`. One transaction on the server: a refused
 * item (422 `SENSITIVE_CONTENT`, `ITEM_LIMIT`) writes nothing.
 */
export async function POST(request: Request) {
  const body = await request.text();
  if (!body.trim()) return Response.json({ error: "Expected a JSON body." }, { status: 400 });
  return forward("/api/profile/items/import", { method: "POST", body });
}

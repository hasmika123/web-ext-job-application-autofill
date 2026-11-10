import { forward } from "@/lib/resume-doc-proxy";

/**
 * GET /api/profile/items[?section=EXPERIENCE] - the signed-in user's live profile items (hidden
 * included). POST - add one: body `{section, dataJson, provenance?, position?}` -> 201 DTO.
 * Spring's refusals are relayed verbatim: 413 `ITEM_TOO_LARGE`, 422 `ITEM_INVALID` /
 * `ITEM_LIMIT {limit}` / `SENSITIVE_CONTENT {path, class}`.
 */
export async function GET(request: Request) {
  const section = new URL(request.url).searchParams.get("section");
  const qs = section ? `?section=${encodeURIComponent(section)}` : "";
  return forward(`/api/profile/items${qs}`);
}

export async function POST(request: Request) {
  const body = await request.text();
  if (!body.trim()) return Response.json({ error: "Expected a JSON body." }, { status: 400 });
  return forward("/api/profile/items", { method: "POST", body });
}

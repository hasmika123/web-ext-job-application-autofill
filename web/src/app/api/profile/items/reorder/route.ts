import { forward } from "@/lib/resume-doc-proxy";

/** POST /api/profile/items/reorder - body `{section, ids:[...]}` -> 204. */
export async function POST(request: Request) {
  const body = await request.text();
  if (!body.trim()) return Response.json({ error: "Expected a JSON body." }, { status: 400 });
  return forward("/api/profile/items/reorder", { method: "POST", body });
}

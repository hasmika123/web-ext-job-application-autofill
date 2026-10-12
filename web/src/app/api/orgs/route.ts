import { forward } from "@/lib/resume-doc-proxy";

/**
 * POST /api/orgs - create a DRAFT organization with the caller as its OWNER (the `/org/new` flow, O2.1). Body
 * `{name, type, slug?, sizeBand?, country?}`. Spring validates and answers the problem JSON the flow branches on:
 * 409 `SLUG_TAKEN` (with `suggestion`), 422 `ORG_INVALID` (`field`), 422 `ORG_LIMIT_REACHED`, 422 `SENSITIVE_CONTENT`.
 */
export async function POST(request: Request) {
  const raw = await request.text();
  if (!raw.trim()) return Response.json({ error: "Expected a JSON body." }, { status: 400 });
  return forward("/api/orgs", { method: "POST", body: raw });
}

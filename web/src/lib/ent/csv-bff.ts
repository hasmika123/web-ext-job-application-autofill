import { serverApiFetch } from "@/lib/api";

/**
 * The BFF half of an organization CSV download (X4.9): checks only the SHAPE (a numeric org id, the allowed query parameters) and streams the API's file
 * through. The API owns every rule (permission, tenant wall, the formula guard and the audited EXPORT row).
 */
const ID = /^\d{1,18}$/;

export async function proxyOrgCsv(req: Request, orgId: string, apiPath: string, allowed: readonly string[], filename: string): Promise<Response> {
  if (!ID.test(orgId)) return Response.json({ error: "Not found." }, { status: 404 });
  const incoming = new URL(req.url).searchParams;
  const out = new URLSearchParams();
  for (const k of allowed) {
    const v = incoming.get(k);
    if (v !== null && v !== "") out.set(k, v);
  }
  const qs = out.toString();
  let res: Response;
  try {
    res = await serverApiFetch(`/api/orgs/${orgId}/${apiPath}${qs ? `?${qs}` : ""}`, { headers: { accept: "text/csv" } });
  } catch {
    return Response.json({ error: "Couldn't reach the server." }, { status: 502 });
  }
  if (res.status === 401) return Response.json({ error: "Your session expired — please sign in again." }, { status: 401 });
  if (res.status === 404) return Response.json({ error: "Not found." }, { status: 404 });
  if (res.status === 400) return Response.json({ error: "That filter was not accepted." }, { status: 400 });
  if (!res.ok) return Response.json({ error: "The export failed." }, { status: 502 });
  return new Response(await res.arrayBuffer(), {
    status: 200,
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${filename}"`, "cache-control": "no-store" },
  });
}

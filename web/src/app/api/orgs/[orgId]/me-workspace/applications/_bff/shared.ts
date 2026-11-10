import { forward } from "@/lib/admin-proxy";

/**
 * The BFF half of the Consultant workspace My Applications page (read-only): validates only the SHAPE of the ids (numeric) and of the
 * list query (status / sort are short words, page / size numbers) and forwards to the API, which owns every rule (permission, tenant
 * wall, "only your own application", status and sort validation). Tenant host headers come with `serverApiFetch`.
 */
const isId = (v: string): boolean => /^\d{1,18}$/.test(v);
const notFound = () => Response.json({ error: "Not found." }, { status: 404 });

const WORD = /^[A-Za-z_]{1,30}$/;
const INT = /^\d{1,6}$/;

export async function applicationsCall(params: Promise<{ orgId: string; applicationId?: string }>, search = ""): Promise<Response> {
  const { orgId, applicationId } = await params;
  if (!isId(orgId) || (applicationId !== undefined && !isId(applicationId))) return notFound();
  const incoming = new URLSearchParams(search);
  const out = new URLSearchParams();
  for (const [key, re] of [["status", WORD], ["sort", WORD], ["page", INT], ["size", INT]] as const) {
    const v = incoming.get(key);
    if (v !== null && re.test(v)) out.set(key, v);
  }
  const query = applicationId === undefined && out.size > 0 ? `?${out.toString()}` : "";
  const path = `/api/orgs/${orgId}/me-workspace/applications${applicationId === undefined ? "" : `/${applicationId}`}${query}`;
  return forward(path, { headers: { accept: "application/json" } });
}

import { forward, readObject } from "@/lib/admin-proxy";

/**
 * The BFF half of the Consultant workspace Submissions and Approvals page: validates only the SHAPE of the ids (numeric) and of the three
 * query parameters, and forwards to the API, which owns every rule (permission, tenant wall, "only your own submission", "only while pending").
 * Tenant host headers come with `serverApiFetch`. Nothing here sends anything to a client: approve and decline only record the decision.
 */
const isId = (v: string): boolean => /^\d{1,18}$/.test(v);
const notFound = () => Response.json({ error: "Not found." }, { status: 404 });

/** Only status / page / size, each a plain token, are passed on. */
export function listQuery(request: Request): string {
  const url = new URL(request.url);
  const out = new URLSearchParams();
  const status = url.searchParams.get("status");
  const page = url.searchParams.get("page");
  const size = url.searchParams.get("size");
  if (status && /^[A-Z_]{1,24}$/.test(status)) out.set("status", status);
  if (page && /^\d{1,6}$/.test(page)) out.set("page", page);
  if (size && /^\d{1,3}$/.test(size)) out.set("size", size);
  const q = out.toString();
  return q ? `?${q}` : "";
}

export async function submissionsCall(
  params: Promise<{ orgId: string; id?: string }>,
  suffix: string,
  init: RequestInit = {},
  request?: Request,
  opts: { query?: boolean; body?: "reason" } = {},
): Promise<Response> {
  const { orgId, id } = await params;
  if (!isId(orgId) || (id !== undefined && !isId(id))) return notFound();
  const path = `/api/orgs/${orgId}/me-workspace/submissions${id === undefined ? "" : `/${id}`}${suffix}${opts.query && request ? listQuery(request) : ""}`;
  if (opts.body === "reason" && request) {
    const obj = await readObject(request);
    const reason = obj && typeof obj.reason === "string" ? obj.reason : "";
    return forward(path, { ...init, headers: { accept: "application/json", "content-type": "application/json" }, body: JSON.stringify({ reason }) });
  }
  return forward(path, { ...init, headers: { accept: "application/json" } });
}

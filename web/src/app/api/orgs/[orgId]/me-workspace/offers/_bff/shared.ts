import { forward, readObject } from "@/lib/admin-proxy";

/**
 * The BFF half of the Consultant workspace Offers page: validates only the SHAPE of the ids (numeric) and of the query parameters, and forwards
 * to the API, which owns every rule (permission, tenant wall, "only your own offer", "only while open", the deadline, the sensitive-data screen).
 * Tenant host headers come with `serverApiFetch`. Nothing here signs, sends or pays anything: accept, decline and negotiate only record the answer.
 */
const isId = (v: string): boolean => /^\d{1,18}$/.test(v);
const notFound = () => Response.json({ error: "Not found." }, { status: 404 });
const plain = (v: string, max: number): boolean => v.length <= max && !/[\u0000-\u001f]/.test(v);

/** Only status / company / workMode / q / sort / page / size, each a plain token, are passed on. */
export function listQuery(request: Request): string {
  const url = new URL(request.url);
  const out = new URLSearchParams();
  const status = url.searchParams.get("status");
  const company = url.searchParams.get("company");
  const workMode = url.searchParams.get("workMode");
  const q = url.searchParams.get("q");
  const sort = url.searchParams.get("sort");
  const page = url.searchParams.get("page");
  const size = url.searchParams.get("size");
  if (status && /^[A-Z_]{1,24}$/.test(status)) out.set("status", status);
  if (company && plain(company, 160)) out.set("company", company);
  if (workMode && /^[A-Z]{1,10}$/.test(workMode)) out.set("workMode", workMode);
  if (q && plain(q, 80)) out.set("q", q);
  if (sort && /^[a-z]{1,10}$/.test(sort)) out.set("sort", sort);
  if (page && /^\d{1,6}$/.test(page)) out.set("page", page);
  if (size && /^\d{1,3}$/.test(size)) out.set("size", size);
  const s = out.toString();
  return s ? `?${s}` : "";
}

export async function offersCall(
  params: Promise<{ orgId: string; id?: string }>,
  suffix: string,
  init: RequestInit = {},
  request?: Request,
  opts: { query?: boolean; body?: "reason" | "note" } = {},
): Promise<Response> {
  const { orgId, id } = await params;
  if (!isId(orgId) || (id !== undefined && !isId(id))) return notFound();
  const path = `/api/orgs/${orgId}/me-workspace/offers${id === undefined ? "" : `/${id}`}${suffix}${opts.query && request ? listQuery(request) : ""}`;
  if (opts.body && request) {
    const obj = await readObject(request);
    const text = obj && typeof obj[opts.body] === "string" ? (obj[opts.body] as string) : "";
    return forward(path, { ...init, headers: { accept: "application/json", "content-type": "application/json" }, body: JSON.stringify({ [opts.body]: text }) });
  }
  return forward(path, { ...init, headers: { accept: "application/json" } });
}

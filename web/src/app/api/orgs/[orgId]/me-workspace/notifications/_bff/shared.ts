import { badBody, forward, onlyFields, readObject } from "@/lib/admin-proxy";

/**
 * The BFF half of the Consultant workspace Notifications page: validates only the SHAPE of the ids (numeric), of the category in the path, of the
 * query parameters and of the body (a JSON object with only the fields that route takes), then forwards to the API, which owns every rule
 * (permission, tenant wall, "only your own notifications", the snooze window, "SMS is not available"). Tenant host headers come with
 * `serverApiFetch`. Nothing here sends an email, a text or a push.
 */
const isId = (v: string): boolean => /^\d{1,18}$/.test(v);
const notFound = () => Response.json({ error: "Not found." }, { status: 404 });
const plain = (v: string, max: number): boolean => v.length <= max && !/[\u0000-\u001f]/.test(v);

const base = (orgId: string, tail: string): string | null => (isId(orgId) ? `/api/orgs/${orgId}/me-workspace/notifications${tail}` : null);
const JSON_HEADERS = { accept: "application/json", "content-type": "application/json" };

/** Only status / category / priority / q / period / page / size, each a plain token, are passed on. */
export function listQuery(request: Request): string {
  const url = new URL(request.url);
  const out = new URLSearchParams();
  const token = (key: string, re: RegExp) => {
    const v = url.searchParams.get(key);
    if (v && re.test(v)) out.set(key, v);
  };
  token("status", /^[A-Z_]{1,12}$/);
  token("category", /^[A-Z_]{1,16}$/);
  token("priority", /^[A-Z]{1,8}$/);
  token("period", /^[A-Z]{1,8}$/);
  token("page", /^\d{1,6}$/);
  token("size", /^\d{1,3}$/);
  const q = url.searchParams.get("q");
  if (q && plain(q, 80)) out.set("q", q);
  const s = out.toString();
  return s ? `?${s}` : "";
}

export async function getPage(params: Promise<{ orgId: string }>, request: Request): Promise<Response> {
  const p = base((await params).orgId, "");
  return p ? forward(`${p}${listQuery(request)}`, { headers: { accept: "application/json" } }) : notFound();
}

/** POST with no body (mark all read, mute). */
export async function postEmpty(params: Promise<{ orgId: string }>, tail: string): Promise<Response> {
  const p = base((await params).orgId, tail);
  return p ? forward(p, { method: "POST", headers: { accept: "application/json" } }) : notFound();
}

/** POST or PUT a JSON object that may only carry `fields` (a category in the path is checked for shape too). */
export async function sendBody(
  request: Request,
  params: Promise<{ orgId: string; category?: string }>,
  method: "POST" | "PUT",
  tail: string,
  fields: readonly string[],
): Promise<Response> {
  const q = await params;
  let suffix = tail;
  if (q.category !== undefined) {
    if (!/^[A-Za-z_]{1,16}$/.test(q.category)) return notFound();
    suffix = `${tail}/${q.category}`;
  }
  const p = base(q.orgId, suffix);
  if (!p) return notFound();
  const body = await readObject(request);
  if (!body) return badBody("Send a JSON object.");
  const extra = onlyFields(body, fields);
  if (extra) return badBody(extra);
  return forward(p, { method, headers: JSON_HEADERS, body: JSON.stringify(body) });
}

export async function removeOne(params: Promise<{ orgId: string; id: string }>): Promise<Response> {
  const q = await params;
  if (!isId(q.id)) return notFound();
  const p = base(q.orgId, `/${q.id}`);
  return p ? forward(p, { method: "DELETE", headers: { accept: "application/json" } }) : notFound();
}

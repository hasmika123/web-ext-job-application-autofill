import { badBody, forward, passthrough, readObject } from "@/lib/admin-proxy";
import { serverApiFetch } from "@/lib/api";

/**
 * The BFF half of the Invitations page: every `app/api/orgs/[orgId]/invitations/**` handler checks the SHAPE of the path (numeric
 * ids) and of the query / body (known keys, bounded lists) and forwards to the API, which owns every rule (permission, tenant wall,
 * role ceiling, limits). The tenant host headers come from `serverApiFetch` (same as branding).
 */
export const orgPath = (orgId: string): string | null => (/^\d{1,18}$/.test(orgId) ? `/api/orgs/${orgId}/invitations` : null);
export const idOk = (id: string): boolean => /^\d{1,18}$/.test(id);
export const notFound = () => Response.json({ error: "Not found." }, { status: 404 });

const LIST_KEYS = ["status", "roleId", "departmentGroupId", "from", "to", "q", "page", "size", "sort"] as const;

/** The list query with only the keys the API reads, each capped in length. */
export function listQuery(url: string, keys: readonly string[] = LIST_KEYS): string {
  const src = new URL(url).searchParams;
  const out = new URLSearchParams();
  for (const k of keys) {
    const v = src.get(k);
    if (v !== null && v.length <= 200) out.set(k, v);
  }
  const s = out.toString();
  return s ? `?${s}` : "";
}

const INVITE_KEYS = ["emails", "roleIds", "departmentGroupId", "teamGroupId", "managerMemberId", "fullName", "message"] as const;
const MAX_BULK = 100;

/** An invite body: only the fields the form sends. */
export async function inviteBody(req: Request): Promise<Record<string, unknown> | Response> {
  const body = await readObject(req);
  if (!body) return badBody("Send a JSON object.");
  const bad = Object.keys(body).find((k) => !(INVITE_KEYS as readonly string[]).includes(k));
  if (bad) return badBody(`Unknown field: ${bad}.`);
  if (!Array.isArray(body.emails) || body.emails.some((e) => typeof e !== "string")) return badBody("Send the addresses as a list of text.");
  return body;
}

/** A bulk action body: `{ ids: [...] }`, at most 100 numeric ids. */
export async function idsBody(req: Request): Promise<{ ids: number[] } | Response> {
  const body = await readObject(req);
  if (!body || !Array.isArray(body.ids) || body.ids.length === 0 || body.ids.length > MAX_BULK) return badBody(`Send between 1 and ${MAX_BULK} invitation ids.`);
  if (body.ids.some((i) => typeof i !== "number" || !Number.isInteger(i) || i <= 0)) return badBody("Invitation ids are whole numbers.");
  return { ids: body.ids as number[] };
}

/**
 * Forwards a call whose success is `204 No Content` (revoke): a 204 can not carry a body, so it is answered as `200 { ok: true }`
 * (the shared `forward` would try to wrap an empty body in a 204 and fail). Refusals keep their status and `{ error, code }` shape.
 */
export async function forwardNoContent(path: string, init?: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await serverApiFetch(path, init);
  } catch {
    return Response.json({ error: "Couldn't reach the server." }, { status: 502 });
  }
  if (res.status === 204) return Response.json({ ok: true });
  return passthrough(res);
}

export { forward };

import { badBody, forward, onlyFields, readObject } from "@/lib/admin-proxy";

/**
 * The BFF half of the Consultant workspace Tasks and Follow-ups page: validates only the SHAPE of the ids (numeric), of the list query (short
 * tokens and numbers, a search text of at most 100 characters) and of the write bodies (known fields only), and forwards to the API, which owns every
 * rule (permission, tenant wall, "only your own task", PII scan, value checks). Tenant host headers come with `serverApiFetch`.
 */
const isId = (v: string): boolean => /^\d{1,18}$/.test(v);
const notFound = () => Response.json({ error: "Not found." }, { status: 404 });

const WORD = /^[A-Za-z_]{1,30}$/;
const INT = /^\d{1,6}$/;
const NAME = /^.{1,120}$/;
const SEARCH = /^.{1,100}$/;

/** Only the known list parameters, each in the right shape, are passed on. */
export function listQuery(search: string): string {
  const incoming = new URLSearchParams(search);
  const out = new URLSearchParams();
  for (const [key, re] of [
    ["tab", WORD],
    ["type", WORD],
    ["priority", WORD],
    ["due", WORD],
    ["sort", WORD],
    ["dir", WORD],
    ["page", INT],
    ["size", INT],
    ["assignedBy", NAME],
    ["q", SEARCH],
  ] as const) {
    const v = incoming.get(key);
    if (v !== null && re.test(v)) out.set(key, v);
  }
  const q = out.toString();
  return q ? `?${q}` : "";
}

export type TasksParams = Promise<{ orgId: string; id?: string }>;
const BASE = (orgId: string) => `/api/orgs/${orgId}/me-workspace/tasks`;

export async function tasksRead(params: TasksParams, suffix: string, search: string): Promise<Response> {
  const { orgId } = await params;
  if (!isId(orgId)) return notFound();
  return forward(`${BASE(orgId)}${suffix}${listQuery(search)}`, { headers: { accept: "application/json" } });
}

const TASK_FIELDS = ["title", "dueOn", "priority", "type", "requirementId"] as const;

/** POST (create) and PUT (edit): the whole editable set of one task. */
export async function tasksWrite(params: TasksParams, request: Request, method: "POST" | "PUT"): Promise<Response> {
  const { orgId, id } = await params;
  if (!isId(orgId) || (method === "PUT" ? id === undefined || !isId(id) : id !== undefined)) return notFound();
  const body = await readObject(request);
  if (!body) return badBody("Send a JSON object.");
  const bad = onlyFields(body, TASK_FIELDS);
  if (bad) return badBody(bad);
  return forward(`${BASE(orgId)}${method === "PUT" ? `/${id}` : ""}`, { method, headers: { accept: "application/json", "content-type": "application/json" }, body: JSON.stringify(body) });
}

export async function tasksStatus(params: TasksParams, request: Request): Promise<Response> {
  const { orgId, id } = await params;
  if (!isId(orgId) || id === undefined || !isId(id)) return notFound();
  const body = await readObject(request);
  const status = body && typeof body.status === "string" ? body.status : "";
  return forward(`${BASE(orgId)}/${id}/status`, { method: "PUT", headers: { accept: "application/json", "content-type": "application/json" }, body: JSON.stringify({ status }) });
}

export async function tasksDelete(params: TasksParams): Promise<Response> {
  const { orgId, id } = await params;
  if (!isId(orgId) || id === undefined || !isId(id)) return notFound();
  return forward(`${BASE(orgId)}/${id}`, { method: "DELETE", headers: { accept: "application/json" } });
}

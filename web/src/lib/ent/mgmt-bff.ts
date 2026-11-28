import { badBody, forward, readObject } from "@/lib/admin-proxy";

/**
 * The single BFF boundary for the Marketing Manager workspace. The API owns the
 * permission and team-scope rules; this layer only allows the documented paths,
 * preserves query strings, and forwards the idempotency key for writes.
 */
const ID = "\\d{1,18}";
const ROUTES: { method: string; pattern: RegExp; body: boolean }[] = [
  { method: "GET", pattern: /^home$/, body: false },
  { method: "GET", pattern: /^(team|assignments|workload|pipeline|approvals|escalations)$/, body: false },
  { method: "GET", pattern: /^pipeline\/summary$/, body: false },
  { method: "GET", pattern: /^escalations\/counts$/, body: false },
  { method: "GET", pattern: new RegExp(`^team/${ID}$`), body: false },
  { method: "GET", pattern: new RegExp(`^assignments/consultants/${ID}/history$`), body: false },
  { method: "GET", pattern: new RegExp(`^(approvals|escalations)/${ID}$`), body: false },
  { method: "GET", pattern: /^reports\/(overview|export)$/, body: false },
  { method: "PATCH", pattern: new RegExp(`^team/${ID}$`), body: true },
  { method: "POST", pattern: /^assignments\/(assign|update|unassign|restore)$/, body: true },
  { method: "POST", pattern: /^workload\/rebalance$/, body: true },
  { method: "POST", pattern: new RegExp(`^approvals/${ID}/(approve|reject)$`), body: true },
  { method: "POST", pattern: new RegExp(`^escalations/${ID}/(acknowledge|assign|snooze|resolve|dismiss|reopen|comment)$`), body: true },
];

export const orgOk = (orgId: string): boolean => /^\d{1,18}$/.test(orgId);
export const notFound = () => Response.json({ error: "Not found." }, { status: 404 });

function passedHeaders(request: Request): Record<string, string> {
  const out: Record<string, string> = {};
  const key = request.headers.get("idempotency-key");
  if (key) out["Idempotency-Key"] = key;
  return out;
}

export async function handle(request: Request, ctx: { params: Promise<{ orgId: string; path?: string[] }> }): Promise<Response> {
  const { orgId, path } = await ctx.params;
  if (!orgOk(orgId)) return notFound();
  const rest = (path ?? []).join("/");
  const route = ROUTES.find((r) => r.method === request.method && r.pattern.test(rest));
  if (!route) return notFound();
  const url = new URL(request.url);
  const target = `/api/orgs/${orgId}/mgmt/${rest}${url.search}`;
  const init: RequestInit = { method: request.method, headers: passedHeaders(request) };
  if (route.body) {
    const body = await readObject(request);
    if (!body) return badBody("Send a JSON object.");
    init.body = JSON.stringify(body);
  }
  return forward(target, init);
}

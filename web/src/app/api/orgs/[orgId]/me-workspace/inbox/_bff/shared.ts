import { badBody, forward, readObject } from "@/lib/admin-proxy";

/**
 * The BFF half of the Consultant workspace Inbox (docs/enterprise-v2/18-consultant-inbox.md). It validates only the SHAPE of the path (a numeric
 * organization id, a numeric suggestion id, a known action) and of the body (a JSON object), then forwards to the API, which owns every rule
 * (the tenant wall, the license, Gmail, rate limits). The organization id in the path is the one the page was served for; the API checks it against
 * the host again and answers the generic 404 for anyone but the consultant.
 *
 * The app password passes through in the POST body to the API and nowhere else: it is not logged, stored, echoed or put in a URL here, and no
 * response carries it (the API has no field for it).
 */
const isId = (v: string): boolean => /^\d{1,18}$/.test(v);
const notFound = () => Response.json({ error: "Not found." }, { status: 404 });

export const inboxPath = (orgId: string, tail = ""): string | null => (isId(orgId) ? `/api/orgs/${orgId}/me-workspace/inbox${tail}` : null);

export async function readInbox(params: Promise<{ orgId: string }>, tail = ""): Promise<Response> {
  const p = inboxPath((await params).orgId, tail);
  return p ? forward(p, { headers: { accept: "application/json" } }) : notFound();
}

/** Connect: the address and the app password, exactly those two fields. */
export async function connectInbox(request: Request, params: Promise<{ orgId: string }>): Promise<Response> {
  const p = inboxPath((await params).orgId);
  if (!p) return notFound();
  const body = await readObject(request);
  if (!body) return badBody("Send a JSON object.");
  const address = typeof body.address === "string" ? body.address.trim() : "";
  const appPassword = typeof body.appPassword === "string" ? body.appPassword : "";
  if (!address || !appPassword) return Response.json({ code: "MISSING", error: "Enter the Gmail address and its app password." }, { status: 400 });
  return forward(p, { method: "POST", body: JSON.stringify({ address, appPassword }), headers: { accept: "application/json" } });
}

export async function disconnectInbox(params: Promise<{ orgId: string }>): Promise<Response> {
  const p = inboxPath((await params).orgId);
  return p ? forward(p, { method: "DELETE", headers: { accept: "application/json" } }) : notFound();
}

export async function setNotify(request: Request, params: Promise<{ orgId: string }>): Promise<Response> {
  const p = inboxPath((await params).orgId, "/notify");
  if (!p) return notFound();
  const body = await readObject(request);
  if (typeof body?.email !== "boolean") return badBody("Say on or off.");
  return forward(p, { method: "PUT", body: JSON.stringify({ email: body.email }), headers: { accept: "application/json" } });
}

const ACTIONS = new Set(["accept", "dismiss"]);

export async function actOnSuggestion(request: Request, params: Promise<{ orgId: string; suggestionId: string; action: string }>): Promise<Response> {
  const { orgId, suggestionId, action } = await params;
  if (!isId(orgId) || !isId(suggestionId) || !ACTIONS.has(action)) return notFound();
  const body = await readObject(request);
  const forwardBody: Record<string, string> = {};
  if (action === "accept") {
    if (typeof body?.company === "string" && body.company.trim()) forwardBody.company = body.company.trim();
    if (typeof body?.roleTitle === "string" && body.roleTitle.trim()) forwardBody.roleTitle = body.roleTitle.trim();
  }
  return forward(`/api/orgs/${orgId}/me-workspace/inbox/suggestions/${suggestionId}/${action}`, {
    method: "POST",
    body: JSON.stringify(forwardBody),
    headers: { accept: "application/json" },
  });
}

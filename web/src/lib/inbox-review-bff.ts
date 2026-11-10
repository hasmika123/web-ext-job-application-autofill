import { badBody, forward, readObject } from "@/lib/admin-proxy";

/**
 * The BFF half of "Needs your review" (inbox safety): shared by the personal routes (`/api/inbox/review/**`, `/api/inbox/settings`,
 * `/api/applications/[id]/inbox-undo/[eventId]`) and the consultant workspace routes. It checks only the SHAPE of ids, actions and bodies,
 * then forwards to the API with the session (and, on a tenant host, the tenant host); the API owns every rule: whose mail it is, the undo
 * window, the licence.
 */
const REF = /^[A-Za-z0-9_-]{1,64}$/;
const ACTIONS = new Set(["accept", "dismiss"]);

export const isRef = (v: string): boolean => REF.test(v);
export const refNotFound = () => Response.json({ error: "Not found." }, { status: 404 });

export function listReview(base: string): Promise<Response> {
  return forward(`${base}/review`, { headers: { accept: "application/json" } });
}

/** POST .../review/{id}/(accept|dismiss). Accept may carry `{ applicationId }` (needed when the mail could match several applications). */
export async function actOnReview(request: Request, base: string, id: string, action: string): Promise<Response> {
  if (!isRef(id) || !ACTIONS.has(action)) return refNotFound();
  const body: Record<string, unknown> = (await readObject(request)) ?? {};
  const out: Record<string, unknown> = {};
  if (action === "accept" && body.applicationId !== undefined && body.applicationId !== null) {
    const a = body.applicationId;
    if (!((typeof a === "number" && Number.isFinite(a)) || (typeof a === "string" && isRef(a)))) return badBody("Choose one of the applications.");
    out.applicationId = a;
  }
  return forward(`${base}/review/${id}/${action}`, { method: "POST", body: JSON.stringify(out), headers: { accept: "application/json" } });
}

/** POST .../inbox-undo/{eventId}: the path is the whole request. */
export function undoInbox(applicationsBase: string, applicationId: string, eventId: string): Promise<Response> {
  if (!isRef(applicationId) || !isRef(eventId)) return Promise.resolve(refNotFound());
  return forward(`${applicationsBase}/${applicationId}/inbox-undo/${eventId}`, { method: "POST", body: "{}", headers: { accept: "application/json" } });
}

export function getInboxSettings(base: string): Promise<Response> {
  return forward(`${base}/settings`, { headers: { accept: "application/json" } });
}

export async function putInboxSettings(request: Request, base: string): Promise<Response> {
  const body = await readObject(request);
  if (typeof body?.applyRejectionsAutomatically !== "boolean") return badBody("Say on or off.");
  return forward(`${base}/settings`, {
    method: "PUT",
    body: JSON.stringify({ applyRejectionsAutomatically: body.applyRejectionsAutomatically }),
    headers: { accept: "application/json" },
  });
}

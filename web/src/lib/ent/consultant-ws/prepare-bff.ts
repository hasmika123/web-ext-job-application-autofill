import { badBody, forward, readObject } from "@/lib/admin-proxy";

/**
 * Shared by the `app/api/orgs/[orgId]/consultant/prepare/**` route handlers (the folder is `consultant`, not `con`: `con` is a reserved device name on
 * Windows; the forwarded API path is still `/con/prepare`). The BFF validates only the SHAPE of the ids (digits) and of the body (`matchIds`: a short list of
 * ids); the feature switch, the consultant gate, ownership of every match and the caps are the API's job, and a refusal arrives as the generic 404 (or a
 * 409 PREPARE_CAP_REACHED). The extension reports its progress straight to the API with its own token, so there is no events route here.
 * E1: nothing here can open, fill or send anything for anyone.
 */
const ID = /^\d{1,18}$/;
const MAX_IDS = 50;
export const notFound = () => Response.json({ error: "Not found." }, { status: 404 });
const base = (orgId: string) => `/api/orgs/${orgId}/con/prepare`;

export async function prepareStatus(orgId: string): Promise<Response> {
  if (!ID.test(orgId)) return notFound();
  return forward(`${base(orgId)}/status`, { headers: { accept: "application/json" } });
}

export async function prepareSession(orgId: string, sessionId: string): Promise<Response> {
  if (!ID.test(orgId) || !ID.test(sessionId)) return notFound();
  return forward(`${base(orgId)}/${sessionId}`, { headers: { accept: "application/json" } });
}

export async function prepareCreate(req: Request, orgId: string): Promise<Response> {
  if (!ID.test(orgId)) return notFound();
  const obj = await readObject(req);
  if (!obj) return badBody("Send a JSON object.");
  const extra = Object.keys(obj).find((k) => k !== "matchIds");
  if (extra) return badBody(`Unknown field: ${extra}.`);
  const ids = obj.matchIds;
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > MAX_IDS || !ids.every((v) => typeof v === "number" && Number.isSafeInteger(v) && v > 0)) {
    return badBody("matchIds must be a short list of opportunity ids.");
  }
  return forward(base(orgId), { method: "POST", headers: { accept: "application/json", "content-type": "application/json" }, body: JSON.stringify({ matchIds: ids }) });
}

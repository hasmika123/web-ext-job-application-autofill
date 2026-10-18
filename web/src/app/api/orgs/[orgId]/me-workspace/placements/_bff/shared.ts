import { forward, readObject } from "@/lib/admin-proxy";

/**
 * The BFF half of the Consultant workspace My Placement page: validates only the SHAPE of the ids (numeric) and of the two small bodies
 * ({completed: boolean}, {note: string}), and forwards to the API, which owns every rule (permission, tenant wall, "only your own placement",
 * validation and the sensitive-data scan). Tenant host headers come with `serverApiFetch`.
 */
const isId = (v: string): boolean => /^\d{1,18}$/.test(v);
const notFound = () => Response.json({ error: "Not found." }, { status: 404 });

export async function placementCall(
  params: Promise<{ orgId: string; itemId?: string }>,
  suffix: string,
  init: RequestInit = {},
  request?: Request,
  body?: "completed" | "note",
): Promise<Response> {
  const { orgId, itemId } = await params;
  if (!isId(orgId) || (itemId !== undefined && !isId(itemId))) return notFound();
  const path = `/api/orgs/${orgId}/me-workspace/placements${itemId === undefined ? "" : `/checklist/${itemId}`}${suffix}`;
  if (body && request) {
    const obj = await readObject(request);
    const payload = body === "completed" ? { completed: obj && typeof obj.completed === "boolean" ? obj.completed : null } : { note: obj && typeof obj.note === "string" ? obj.note : "" };
    return forward(path, { ...init, headers: { accept: "application/json", "content-type": "application/json" }, body: JSON.stringify(payload) });
  }
  return forward(path, { ...init, headers: { accept: "application/json" } });
}

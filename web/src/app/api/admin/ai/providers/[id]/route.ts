import { badBody, forward, onlyFields, readObject } from "../../respond";

const FIELDS = ["enabled", "baseUrl", "timeoutMs", "models", "reason", "force"] as const;

/**
 * PATCH /api/admin/ai/providers/{id} `{ enabled?, baseUrl?, timeoutMs?, models?, reason?, force? }`. Only the changed
 * fields are sent; a JSON null clears a field back to env. Turning a provider off needs a reason (the API says so).
 */
export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await readObject(request);
  if (!body) return badBody("Send a JSON object.");
  const bad = onlyFields(body, FIELDS);
  if (bad) return badBody(bad);
  if (body.enabled !== undefined && body.enabled !== null && typeof body.enabled !== "boolean") return badBody("enabled must be true or false.");
  if (body.baseUrl !== undefined && body.baseUrl !== null && typeof body.baseUrl !== "string") return badBody("baseUrl must be text.");
  if (body.timeoutMs !== undefined && body.timeoutMs !== null && typeof body.timeoutMs !== "number") return badBody("timeoutMs must be a number.");
  if (body.models !== undefined && body.models !== null && !(Array.isArray(body.models) && body.models.every((m) => typeof m === "string"))) {
    return badBody("models must be a list of model ids.");
  }
  if (body.reason !== undefined && typeof body.reason !== "string") return badBody("reason must be text.");
  if (body.force !== undefined && typeof body.force !== "boolean") return badBody("force must be true or false.");
  return forward(`/api/admin/ai/providers/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(body) });
}

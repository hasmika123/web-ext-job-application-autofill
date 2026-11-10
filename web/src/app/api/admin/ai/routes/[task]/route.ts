import { badBody, forward, onlyFields, readObject } from "../../respond";

const FIELDS = ["enabled", "provider", "model", "fallbackProvider", "fallbackModel", "maxOutputTokens", "reason"] as const;
const TEXT_FIELDS = ["provider", "model", "fallbackProvider", "fallbackModel", "reason"] as const;

/**
 * PATCH /api/admin/ai/routes/{task}: change the fields named in the body (a JSON null clears a field back to env; a
 * blank model clears it too). Turning `parse` off needs a reason. DELETE resets the whole task to env.
 */
export async function PATCH(request: Request, ctx: { params: Promise<{ task: string }> }) {
  const { task } = await ctx.params;
  const body = await readObject(request);
  if (!body) return badBody("Send a JSON object.");
  const bad = onlyFields(body, FIELDS);
  if (bad) return badBody(bad);
  if (body.enabled !== undefined && body.enabled !== null && typeof body.enabled !== "boolean") return badBody("enabled must be true or false.");
  if (body.maxOutputTokens !== undefined && body.maxOutputTokens !== null && typeof body.maxOutputTokens !== "number") {
    return badBody("maxOutputTokens must be a number.");
  }
  for (const f of TEXT_FIELDS) {
    if (body[f] !== undefined && body[f] !== null && typeof body[f] !== "string") return badBody(`${f} must be text.`);
  }
  return forward(`/api/admin/ai/routes/${encodeURIComponent(task)}`, { method: "PATCH", body: JSON.stringify(body) });
}

export async function DELETE(_request: Request, ctx: { params: Promise<{ task: string }> }) {
  const { task } = await ctx.params;
  return forward(`/api/admin/ai/routes/${encodeURIComponent(task)}`, { method: "DELETE" });
}

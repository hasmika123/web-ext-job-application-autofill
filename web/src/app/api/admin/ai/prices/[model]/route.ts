import { badBody, forward, onlyFields, readObject } from "../../respond";

const FIELDS = ["inputPerMtokMicros", "cachedPerMtokMicros", "outputPerMtokMicros"] as const;

/**
 * PUT /api/admin/ai/prices/{model} `{ inputPerMtokMicros, cachedPerMtokMicros, outputPerMtokMicros }` (all three,
 * whole millionths of a dollar per million tokens). DELETE puts the code default back, or drops a model with none.
 * `{model}` is URL-encoded (qwen3:8b -> qwen3%3A8b).
 */
export async function PUT(request: Request, ctx: { params: Promise<{ model: string }> }) {
  const { model } = await ctx.params;
  const body = await readObject(request);
  if (!body) return badBody("Send a JSON object.");
  const bad = onlyFields(body, FIELDS);
  if (bad) return badBody(bad);
  for (const f of FIELDS) {
    if (typeof body[f] !== "number" || !Number.isInteger(body[f])) return badBody(`${f} must be a whole number.`);
  }
  return forward(`/api/admin/ai/prices/${encodeURIComponent(model)}`, { method: "PUT", body: JSON.stringify(body) });
}

export async function DELETE(_request: Request, ctx: { params: Promise<{ model: string }> }) {
  const { model } = await ctx.params;
  return forward(`/api/admin/ai/prices/${encodeURIComponent(model)}`, { method: "DELETE" });
}

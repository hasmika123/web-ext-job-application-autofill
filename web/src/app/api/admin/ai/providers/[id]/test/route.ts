import { badBody, forward, onlyFields, readObject } from "../../../respond";

/**
 * POST /api/admin/ai/providers/{id}/test `{ model? }`: one real, metered, rate-limited call to the provider. The API
 * answers 200 whenever the test RAN (ok=false carries the scrubbed error); 404 / 409 / 429 come before it runs.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await readObject(request)) ?? {};
  const bad = onlyFields(body, ["model"]);
  if (bad) return badBody(bad);
  if (body.model !== undefined && body.model !== null && typeof body.model !== "string") return badBody("model must be text.");
  return forward(`/api/admin/ai/providers/${encodeURIComponent(id)}/test`, { method: "POST", body: JSON.stringify(body) });
}

import { badBody, forward, onlyFields, readObject } from "../../respond";

/** PATCH /api/admin/ai/config/global `{ enabled, reason? }`: the server-AI kill switch (a reason is required to turn it off). */
export async function PATCH(request: Request) {
  const body = await readObject(request);
  if (!body) return badBody("Send a JSON object.");
  const bad = onlyFields(body, ["enabled", "reason"]);
  if (bad) return badBody(bad);
  if (typeof body.enabled !== "boolean" && body.enabled !== null) return badBody("enabled must be true or false.");
  if (body.reason !== undefined && typeof body.reason !== "string") return badBody("reason must be text.");
  return forward("/api/admin/ai/config/global", { method: "PATCH", body: JSON.stringify(body) });
}

import { badBody, forward, onlyFields, readObject } from "@/lib/admin-proxy";
import { AUTOPILOT_KEYS } from "@/lib/admin-autopilot";

/**
 * GET / PUT /api/admin/settings/{key} - the platform's Autopilot settings (gap D12): the master switch and its maximums. Only those keys pass; every
 * other registry key is a 404 here, so this route can never become a general settings writer. A PUT forwards `{ value, reason }` only (Spring
 * requires a reason of at least 10 characters for a HIGH-risk change and audits it). Spring enforces ROLE_ADMIN.
 */
type Ctx = { params: Promise<{ key: string }> };

async function keyOf(ctx: Ctx): Promise<string | null> {
  const { key } = await ctx.params;
  return (AUTOPILOT_KEYS as readonly string[]).includes(key) ? key : null;
}

export async function GET(_request: Request, ctx: Ctx) {
  const key = await keyOf(ctx);
  if (!key) return Response.json({ error: "Not found." }, { status: 404 });
  return forward(`/api/admin/settings/${encodeURIComponent(key)}`);
}

export async function PUT(request: Request, ctx: Ctx) {
  const key = await keyOf(ctx);
  if (!key) return Response.json({ error: "Not found." }, { status: 404 });
  const body = await readObject(request);
  if (!body) return badBody("Send a JSON object.");
  const extra = onlyFields(body, ["value", "reason"]);
  if (extra) return badBody(extra);
  return forward(`/api/admin/settings/${encodeURIComponent(key)}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ value: body.value, reason: body.reason }),
  });
}

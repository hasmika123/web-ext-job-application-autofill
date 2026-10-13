import { badBody, forward, forwardDelete, groupsPath, isId, notFound, readObject, writeHeaders } from "@/lib/ent/groups-bff";

type Ctx = { params: Promise<{ orgId: string; groupId: string }> };

async function target(ctx: Ctx): Promise<string | null> {
  const { orgId, groupId } = await ctx.params;
  const p = groupsPath(orgId);
  return p && isId(groupId) ? `${p}/${groupId}` : null;
}

/** GET: one group with its people and teams. */
export async function GET(_req: Request, ctx: Ctx) {
  const t = await target(ctx);
  return t ? forward(t) : notFound();
}

/** PATCH: rename, re-parent, change the lead, status, icon or colour. `If-Match` is the version the page last saw. */
export async function PATCH(request: Request, ctx: Ctx) {
  const t = await target(ctx);
  if (!t) return notFound();
  const body = await readObject(request);
  if (!body) return badBody("Send a JSON object.");
  return forward(t, { method: "PATCH", body: JSON.stringify(body), headers: writeHeaders(request) });
}

/** DELETE: only an empty group, with its version. */
export async function DELETE(request: Request, ctx: Ctx) {
  const t = await target(ctx);
  return t ? forwardDelete(t, { headers: writeHeaders(request) }) : notFound();
}

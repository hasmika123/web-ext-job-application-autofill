import { ID_RX, UPDATE_FIELDS, badBody, forward, ifMatchHeaders, notFound, onlyFields, readObject, rolesPath } from "@/lib/ent/roles-bff";

type Ctx = { params: Promise<{ orgId: string; roleId: string }> };

async function target(ctx: Ctx): Promise<string | null> {
  const { orgId, roleId } = await ctx.params;
  const p = rolesPath(orgId);
  return p && ID_RX.test(roleId) ? `${p}/${roleId}` : null;
}

/** GET: one role with its rows and its version. */
export async function GET(_req: Request, ctx: Ctx) {
  const t = await target(ctx);
  return t ? forward(t) : notFound();
}

/** PATCH: rename or replace the permission set; `If-Match` is the version the editor loaded. */
export async function PATCH(request: Request, ctx: Ctx) {
  const t = await target(ctx);
  if (!t) return notFound();
  const body = await readObject(request);
  if (!body) return badBody("Send a JSON object.");
  const bad = onlyFields(body, UPDATE_FIELDS);
  if (bad) return badBody(bad);
  return forward(t, { method: "PATCH", body: JSON.stringify(body), headers: ifMatchHeaders(request) });
}

/** DELETE: a role nobody holds; `If-Match` required. */
export async function DELETE(request: Request, ctx: Ctx) {
  const t = await target(ctx);
  return t ? forward(t, { method: "DELETE", headers: ifMatchHeaders(request) }) : notFound();
}

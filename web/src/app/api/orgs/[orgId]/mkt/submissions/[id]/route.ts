import { forward, itemPath, notFound } from "@/lib/ent/marketer-ws/submissions-bff";

type Ctx = { params: Promise<{ orgId: string; id: string }> };

/** GET /api/orgs/{orgId}/mkt/submissions/{id}: one record with its history. */
export async function GET(_req: Request, { params }: Ctx) {
  const { orgId, id } = await params;
  const p = itemPath(orgId, id);
  return p ? forward(p, { headers: { accept: "application/json" } }) : notFound();
}

/** DELETE /api/orgs/{orgId}/mkt/submissions/{id}: withdraw a draft (the record leaves the board; its history stays). */
export async function DELETE(_req: Request, { params }: Ctx) {
  const { orgId, id } = await params;
  const p = itemPath(orgId, id);
  return p ? forward(p, { method: "DELETE" }) : notFound();
}

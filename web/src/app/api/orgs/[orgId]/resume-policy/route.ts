import { badBody, forward, onlyFields, readObject } from "@/lib/admin-proxy";

/**
 * The BFF half of the org admin's Resume Builder policy: validates the SHAPE (numeric org id, one boolean field) and forwards to the API,
 * which owns every rule (permission, tenant wall, audit).
 */
const path = (orgId: string): string | null => (/^\d{1,18}$/.test(orgId) ? `/api/orgs/${orgId}/resume-policy` : null);
const notFound = () => Response.json({ error: "Not found." }, { status: 404 });

export async function GET(_req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const p = path((await params).orgId);
  return p ? forward(p) : notFound();
}

export async function PUT(request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const p = path((await params).orgId);
  if (!p) return notFound();
  const body = await readObject(request);
  if (!body) return badBody("Send a JSON object.");
  const bad = onlyFields(body, ["consultantShareLinks"]);
  if (bad) return badBody(bad);
  if (typeof body.consultantShareLinks !== "boolean") return badBody("consultantShareLinks must be true or false.");
  return forward(p, { method: "PUT", body: JSON.stringify(body) });
}

import { CREATE_FIELDS, badBody, forward, notFound, onlyFields, readObject, rolesPath } from "@/lib/ent/roles-bff";

/** GET /api/orgs/{orgId}/roles: the system templates and the organization's roles with their rows. */
export async function GET(_req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const p = rolesPath((await params).orgId);
  return p ? forward(p) : notFound();
}

/** POST /api/orgs/{orgId}/roles: create a role (blank, from a template, or a copy). */
export async function POST(request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const p = rolesPath((await params).orgId);
  if (!p) return notFound();
  const body = await readObject(request);
  if (!body) return badBody("Send a JSON object.");
  const bad = onlyFields(body, CREATE_FIELDS);
  if (bad) return badBody(bad);
  return forward(p, { method: "POST", body: JSON.stringify(body) });
}

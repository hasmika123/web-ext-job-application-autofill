import { badBody, forward, groupsPath, notFound, readObject } from "@/lib/ent/groups-bff";

/** GET /api/orgs/{orgId}/groups: every group the caller may see. */
export async function GET(_req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const p = groupsPath((await params).orgId);
  return p ? forward(p) : notFound();
}

/** POST /api/orgs/{orgId}/groups: create a department, team or cohort. */
export async function POST(request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const p = groupsPath((await params).orgId);
  if (!p) return notFound();
  const body = await readObject(request);
  if (!body) return badBody("Send a JSON object.");
  return forward(p, { method: "POST", body: JSON.stringify(body) });
}

import { badBody, forward, onlyFields, readObject } from "@/lib/admin-proxy";

/** POST /api/admin/orgs/{id}/owner/reset-password `{ reason }` - a new temporary password for an owner who has not set their own; shown once. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d{1,18}$/.test(id)) return Response.json({ error: "Not found." }, { status: 404 });
  const body = await readObject(request);
  if (!body) return badBody("Send a JSON object.");
  const bad = onlyFields(body, ["reason"]);
  if (bad) return badBody(bad);
  const res = await forward(`/api/admin/orgs/${id}/owner/reset-password`, { method: "POST", body: JSON.stringify(body) });
  res.headers.set("cache-control", "no-store"); // the answer carries a one-time password
  return res;
}

import { badBody, forward, onlyFields, readObject } from "@/lib/admin-proxy";

/** POST /api/admin/orgs/{id}/billing/start `{ billingEmail, waiveSetupFee, reason }` - the platform admin starts billing (reason required by the API). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d{1,18}$/.test(id)) return Response.json({ error: "Not found." }, { status: 404 });
  const body = await readObject(request);
  if (!body) return badBody("Send a JSON object.");
  const bad = onlyFields(body, ["billingEmail", "waiveSetupFee", "reason"]);
  if (bad) return badBody(bad);
  return forward(`/api/admin/orgs/${id}/billing/start`, { method: "POST", body: JSON.stringify(body) });
}

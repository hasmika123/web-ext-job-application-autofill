import { badBody, forward, onlyFields, readObject } from "@/lib/admin-proxy";

/** POST /api/admin/orgs/{id}/hostnames/{hid}/suspend|resume `{ reason }`. Any other action is a 404. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string; hid: string; action: string }> }) {
  const { id, hid, action } = await params;
  if (!/^\d{1,18}$/.test(id) || !/^\d{1,18}$/.test(hid) || (action !== "suspend" && action !== "resume")) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }
  const body = await readObject(request);
  if (!body) return badBody("Send a JSON object.");
  const bad = onlyFields(body, ["reason"]);
  if (bad) return badBody(bad);
  return forward(`/api/admin/orgs/${id}/hostnames/${hid}/${action}`, { method: "POST", body: JSON.stringify(body) });
}

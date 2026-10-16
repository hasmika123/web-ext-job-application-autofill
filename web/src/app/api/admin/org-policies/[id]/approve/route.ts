import { badBody, forward, onlyFields, readObject } from "@/lib/admin-proxy";

/** POST /api/admin/org-policies/{id}/approve - publish the submission. Body: { comment? }. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d{1,18}$/.test(id)) return Response.json({ error: "Not found." }, { status: 404 });
  const body = (await readObject(request)) ?? {};
  const bad = onlyFields(body, ["comment"]);
  if (bad) return badBody(bad);
  return forward(`/api/admin/org-policies/${id}/approve`, { method: "POST", body: JSON.stringify(body) });
}

import { forward } from "@/lib/admin-proxy";

/** GET /api/admin/org-policies/{id} - one submission: the proposed text and the live text to compare. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d{1,18}$/.test(id)) return Response.json({ error: "Not found." }, { status: 404 });
  return forward(`/api/admin/org-policies/${id}`);
}

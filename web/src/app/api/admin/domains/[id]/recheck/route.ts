import { forward } from "@/lib/admin-proxy";

/** POST /api/admin/domains/{id}/recheck - run the address's DNS check and certificate probe now (admin-audited). */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d{1,18}$/.test(id)) return Response.json({ error: "Not found." }, { status: 404 });
  return forward(`/api/admin/domains/${id}/recheck`, { method: "POST" });
}

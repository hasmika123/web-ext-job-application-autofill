import { forward } from "@/lib/admin-proxy";

/** GET /api/admin/orgs/{id} - the organization, its counts, hostnames, enterprise switch and admin audit tail (no member data). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d{1,18}$/.test(id)) return Response.json({ error: "Not found." }, { status: 404 });
  return forward(`/api/admin/orgs/${id}`);
}

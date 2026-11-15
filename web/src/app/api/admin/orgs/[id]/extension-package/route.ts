import { forward } from "@/lib/admin-proxy";

/** GET /api/admin/orgs/{id}/extension-package - the settings of the organization's own extension build (CUSTOM-DOMAINS-BUILD.md A6); 409 until it has a live custom domain. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d{1,18}$/.test(id)) return Response.json({ error: "Not found." }, { status: 404 });
  return forward(`/api/admin/orgs/${id}/extension-package`);
}

import { forward } from "@/lib/admin-proxy";
import { notFound, pickQuery } from "@/lib/admin-plans-bff";

/** GET ?status=&interval=&successor=&scope=&page=&size= - the per-subscriber (or per-org) rows of a retirement. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d{1,18}$/.test(id)) return notFound();
  return forward(`/api/admin/retirements/${id}/items${pickQuery(request, ["status", "interval", "successor", "scope", "page", "size"])}`);
}

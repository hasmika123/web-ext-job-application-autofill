import { forward } from "@/lib/admin-proxy";
import { notFound } from "@/lib/admin-plans-bff";

/** GET - one retirement with its counts, MRR retained and at risk, decisions over time and what the admin may still do. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d{1,18}$/.test(id)) return notFound();
  return forward(`/api/admin/retirements/${id}`);
}

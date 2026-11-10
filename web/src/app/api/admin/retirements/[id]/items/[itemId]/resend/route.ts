import { forward } from "@/lib/admin-proxy";
import { notFound } from "@/lib/admin-plans-bff";

/** POST - send this subscriber the current notice again (a billing_notice row; dedupe is the API's). */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const { id, itemId } = await params;
  if (!/^\d{1,18}$/.test(id) || !/^\d{1,18}$/.test(itemId)) return notFound();
  return forward(`/api/admin/retirements/${id}/items/${itemId}/resend`, { method: "POST", body: "{}" });
}

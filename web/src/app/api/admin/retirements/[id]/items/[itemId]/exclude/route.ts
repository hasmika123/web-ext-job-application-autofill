import { forwardObject, notFound } from "@/lib/admin-plans-bff";

/** POST (`reason`) - take one subscriber out of the retirement; they keep the plan. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const { id, itemId } = await params;
  if (!/^\d{1,18}$/.test(id) || !/^\d{1,18}$/.test(itemId)) return notFound();
  return forwardObject(request, `/api/admin/retirements/${id}/items/${itemId}/exclude`, "POST", ["reason"]);
}

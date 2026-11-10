import { forwardObject, notFound } from "@/lib/admin-plans-bff";

/** POST (`reason`) - close a completed retirement (the plan becomes RETIRED). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d{1,18}$/.test(id)) return notFound();
  return forwardObject(request, `/api/admin/retirements/${id}/close`, "POST", ["reason"]);
}

import { forward } from "@/lib/admin-proxy";

/** GET /api/admin/orgs/{id}/billing - the organization's billing account, setup fee and whether Stripe is used (ORG-BILLING-BUILD.md step 2). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d{1,18}$/.test(id)) return Response.json({ error: "Not found." }, { status: 404 });
  return forward(`/api/admin/orgs/${id}/billing`);
}

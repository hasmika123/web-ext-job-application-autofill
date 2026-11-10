import { forward } from "@/lib/admin-proxy";

/** GET /api/admin/orgs/label-check?label&orgId - the provision dialog's live reserved / taken check. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const qs = new URLSearchParams();
  const label = url.searchParams.get("label");
  const orgId = url.searchParams.get("orgId");
  qs.set("label", (label ?? "").slice(0, 80));
  if (orgId && /^\d{1,18}$/.test(orgId)) qs.set("orgId", orgId);
  return forward(`/api/admin/orgs/label-check?${qs}`);
}

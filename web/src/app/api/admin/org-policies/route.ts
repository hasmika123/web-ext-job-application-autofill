import { forward } from "@/lib/admin-proxy";

const STATUSES = new Set(["IN_REVIEW", "PUBLISHED", "REJECTED", "WITHDRAWN", "SUPERSEDED"]);

/** GET /api/admin/org-policies?status=IN_REVIEW - the Policy reviews queue across organizations (platform admin only; the API enforces it). */
export async function GET(request: Request) {
  const status = new URL(request.url).searchParams.get("status") ?? "IN_REVIEW";
  return forward(`/api/admin/org-policies?status=${STATUSES.has(status) ? status : "IN_REVIEW"}`);
}

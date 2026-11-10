import { forward } from "@/lib/admin-proxy";

/** GET /api/admin/orgs/summary - the four stat tiles. */
export async function GET() {
  return forward("/api/admin/orgs/summary");
}

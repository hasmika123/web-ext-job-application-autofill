import { forward } from "@/lib/admin-proxy";

/** GET /api/admin/subprocessors: every slot of the subprocessor register (ADMIN only on the API), with the DPA status the admin tracks. */
export async function GET() {
  return forward("/api/admin/privacy/subprocessors");
}

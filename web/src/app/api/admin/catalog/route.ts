import { forward } from "@/lib/admin-proxy";

/** GET /api/admin/catalog - products, prices, services, presets, tiers, floors, fee model and catalog version (the editor reads products and presets). */
export async function GET() {
  return forward("/api/admin/catalog");
}

import { forward } from "../respond";

/** GET /api/admin/ai/config: providers, routes, prices and the global switch with where each value comes from. */
export async function GET() {
  return forward("/api/admin/ai/config");
}

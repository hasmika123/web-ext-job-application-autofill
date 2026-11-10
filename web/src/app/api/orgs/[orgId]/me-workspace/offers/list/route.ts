import { offersCall } from "../_bff/shared";

/** GET .../me-workspace/offers/list: one filtered, sorted page of the caller's own offers. */
export async function GET(request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  return offersCall(params, "/list", {}, request, { query: true });
}

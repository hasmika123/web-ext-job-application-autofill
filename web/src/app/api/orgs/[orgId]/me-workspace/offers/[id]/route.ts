import { offersCall } from "../_bff/shared";

/** GET .../me-workspace/offers/{id}: one of the caller's own offers in full. */
export async function GET(_req: Request, { params }: { params: Promise<{ orgId: string; id: string }> }) {
  return offersCall(params, "");
}

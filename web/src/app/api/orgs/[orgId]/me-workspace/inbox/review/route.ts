import { reviewList } from "../_bff/review";

/** GET /api/orgs/{orgId}/me-workspace/inbox/review: mail the inbox was not sure about (consultant only). */
export async function GET(_request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  return reviewList(params);
}

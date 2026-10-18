import { listReview } from "@/lib/inbox-review-bff";

/** GET /api/inbox/review: the mail the inbox read but was not sure enough to apply by itself. */
export async function GET() {
  return listReview("/api/profile/inbox");
}

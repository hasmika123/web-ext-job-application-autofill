import { getInboxSettings, putInboxSettings } from "@/lib/inbox-review-bff";

/** GET / PUT /api/inbox/settings `{ applyRejectionsAutomatically }` (default off). */
export async function GET() {
  return getInboxSettings("/api/profile/inbox");
}

export async function PUT(request: Request) {
  return putInboxSettings(request, "/api/profile/inbox");
}

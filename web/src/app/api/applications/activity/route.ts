import { forward, search } from "@/lib/tracker-proxy";

/**
 * GET /api/applications/activity?days=&tz= - events per day for the dashboard's activity bars:
 * `[{day: "yyyy-MM-dd", count}]`, oldest first, quiet days as 0. `days` defaults to and is capped by the
 * server's `tracker.activity.*` settings; pass the browser's time zone as `tz` so days are the user's days.
 */
export async function GET(request: Request) {
  return forward(`/api/profile/applications/activity${search(request)}`);
}

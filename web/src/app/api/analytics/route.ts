import { forward, search } from "@/lib/tracker-proxy";

/**
 * GET /api/analytics?range=&tz= - the user's job-search numbers (`/api/profile/analytics`): stats, the over-time
 * bars, the status breakdown and (once a reply came through the inbox) response by company. `range` is days and is
 * clamped by the server's `analytics.*` settings; pass the browser's time zone as `tz` so weeks are the user's weeks.
 */
export async function GET(request: Request) {
  return forward(`/api/profile/analytics${search(request)}`);
}

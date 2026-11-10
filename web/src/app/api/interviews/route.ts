import { forward, search } from "@/lib/tracker-proxy";

/**
 * GET /api/interviews?from=&to=&outcome= - the caller's interviews in a date range, soonest first, each with
 * its application's `company` and `roleTitle` (the dashboard's "Upcoming interviews" and the prep page).
 * `from` / `to` are ISO-8601 instants or dates (a date `to` includes that day); with none, from now for the
 * server's default window. `outcome=PENDING` finds interviews still waiting for a result.
 */
export async function GET(request: Request) {
  return forward(`/api/profile/interviews${search(request)}`);
}

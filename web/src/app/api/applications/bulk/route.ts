import { forwardJson } from "@/lib/tracker-proxy";

/**
 * POST /api/applications/bulk - `{ids: number[], action: "ARCHIVE"|"UNARCHIVE"|"STATUS"|"STAR"|"UNSTAR",
 * status?}` -> `{done: id[], failed: [{id, reason}]}`. The page toasts "11 of 12 archived" from the two
 * lists; an id that is not the caller's is reported as `NOT_FOUND`, not an error. The id cap is a server
 * setting (422 `TRACKER_LIMIT {limit}`).
 */
export async function POST(request: Request) {
  return forwardJson(request, "/api/profile/applications/bulk", "POST");
}

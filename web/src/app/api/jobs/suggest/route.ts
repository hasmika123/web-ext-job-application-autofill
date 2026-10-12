import { forward, search } from "@/lib/tracker-proxy";

/** GET /api/jobs/suggest?q= - job titles to offer as you type in the top-bar search (`[title]`, empty when too short). */
export async function GET(request: Request) {
  return forward(`/api/jobs/suggest${search(request)}`);
}

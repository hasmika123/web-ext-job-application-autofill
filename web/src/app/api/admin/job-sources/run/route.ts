import { serverApiFetch } from "@/lib/api";
import { passthrough } from "../respond";

/**
 * POST /api/admin/job-sources/run — read every job board now (Phase 13.6a). Spring starts it in the
 * background and answers 202 at once (409 if a read is already going); the page polls the list.
 */
export async function POST() {
  let res: Response;
  try {
    res = await serverApiFetch("/api/admin/job-sources/run", { method: "POST" });
  } catch {
    return Response.json({ error: "Couldn't reach the server." }, { status: 502 });
  }
  return passthrough(res);
}

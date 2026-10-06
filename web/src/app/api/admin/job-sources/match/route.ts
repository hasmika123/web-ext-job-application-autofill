import { serverApiFetch } from "@/lib/api";
import { passthrough } from "../respond";

/**
 * POST /api/admin/job-sources/match — run daily job matching now for everyone who has it on
 * (Phase 13.6b). Spring starts it in the background (202; 409 if a run is going). Users matched in
 * the last 20 hours are skipped, so this never pays for the same user twice in a day.
 */
export async function POST() {
  let res: Response;
  try {
    res = await serverApiFetch("/api/admin/job-sources/match", { method: "POST" });
  } catch {
    return Response.json({ error: "Couldn't reach the server." }, { status: 502 });
  }
  return passthrough(res);
}

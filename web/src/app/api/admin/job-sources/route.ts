import { serverApiFetch } from "@/lib/api";
import { passthrough } from "./respond";

/**
 * POST /api/admin/job-sources `{ ats, boardToken, companyName }` — add a job board to the job-match
 * pool (Phase 13.6a). Spring enforces ROLE_ADMIN, reads the board once to check it answers, and
 * audits. The list itself is read server-side by the admin page.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { ats?: unknown; boardToken?: unknown; companyName?: unknown } | null;
  const ats = typeof body?.ats === "string" ? body.ats : "";
  const boardToken = typeof body?.boardToken === "string" ? body.boardToken.trim() : "";
  const companyName = typeof body?.companyName === "string" ? body.companyName.trim() : "";
  if (!["greenhouse", "lever", "ashby"].includes(ats) || !boardToken || !companyName) {
    return Response.json({ error: "Pick the ATS and give the board name and company." }, { status: 400 });
  }
  let res: Response;
  try {
    res = await serverApiFetch("/api/admin/job-sources", { method: "POST", body: JSON.stringify({ ats, boardToken, companyName }) });
  } catch {
    return Response.json({ error: "Couldn't reach the server." }, { status: 502 });
  }
  return passthrough(res);
}

import { submissionsCall } from "../_bff/shared";

/** GET .../me-workspace/submissions/past: one page of the caller's past submissions (optional status / page / size). */
export async function GET(request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  return submissionsCall(params, "/past", {}, request, { query: true });
}

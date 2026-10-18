import { submissionsCall } from "../_bff/shared";

/** GET .../me-workspace/submissions/{id}: one of the caller's own submissions in full. */
export async function GET(_req: Request, { params }: { params: Promise<{ orgId: string; id: string }> }) {
  return submissionsCall(params, "");
}

import { applicationsCall } from "../_bff/shared";

/** GET .../me-workspace/applications/{applicationId}: dates and the stage timeline of one of the caller's own applications. */
export async function GET(_req: Request, { params }: { params: Promise<{ orgId: string; applicationId: string }> }) {
  return applicationsCall(params);
}

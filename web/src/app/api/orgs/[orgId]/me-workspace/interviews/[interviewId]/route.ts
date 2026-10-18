import { interviewsCall } from "../_bff/shared";

/** GET .../interviews/{interviewId}: one of the consultant's own interviews with their join details and feedback. */
export async function GET(_req: Request, { params }: { params: Promise<{ orgId: string; interviewId: string }> }) {
  return interviewsCall(params, "");
}

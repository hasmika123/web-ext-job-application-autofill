import { interviewsCall } from "../../_bff/shared";

type P = { params: Promise<{ orgId: string; interviewId: string }> };

/** POST .../interviews/{interviewId}/feedback: record what the consultant heard after a completed interview. */
export async function POST(request: Request, { params }: P) {
  return interviewsCall(params, "/feedback", { method: "POST" }, request);
}

/** PUT .../interviews/{interviewId}/feedback: edit that feedback. */
export async function PUT(request: Request, { params }: P) {
  return interviewsCall(params, "/feedback", { method: "PUT" }, request);
}

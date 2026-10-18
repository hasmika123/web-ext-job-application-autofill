import { interviewsCall } from "../../_bff/shared";

/** PUT .../interviews/{interviewId}/detail: save how the consultant joins (mode, https link, interviewer title, prep note). Never moves the interview. */
export async function PUT(request: Request, { params }: { params: Promise<{ orgId: string; interviewId: string }> }) {
  return interviewsCall(params, "/detail", { method: "PUT" }, request);
}

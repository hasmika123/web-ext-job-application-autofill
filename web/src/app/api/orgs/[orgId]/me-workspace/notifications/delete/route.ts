import { sendBody } from "../_bff/shared";

/** POST .../notifications/delete: delete several of the caller's own notifications (a soft delete). */
export async function POST(request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  return sendBody(request, params, "POST", "/delete", ["ids"]);
}

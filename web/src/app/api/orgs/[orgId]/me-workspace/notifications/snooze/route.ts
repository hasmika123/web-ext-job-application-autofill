import { sendBody } from "../_bff/shared";

/** POST .../notifications/snooze: hide the caller's own notifications until a time at most 14 days away. */
export async function POST(request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  return sendBody(request, params, "POST", "/snooze", ["ids", "until"]);
}

import { sendBody } from "../_bff/shared";

/** POST .../notifications/read: mark one or several of the caller's own notifications read or unread. */
export async function POST(request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  return sendBody(request, params, "POST", "/read", ["ids", "read"]);
}

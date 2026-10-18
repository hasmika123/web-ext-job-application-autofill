import { sendBody } from "../_bff/shared";

/** POST .../notifications/resolve: mark the caller's own notifications handled. */
export async function POST(request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  return sendBody(request, params, "POST", "/resolve", ["ids"]);
}

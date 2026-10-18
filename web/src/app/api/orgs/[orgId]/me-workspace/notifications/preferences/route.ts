import { sendBody } from "../_bff/shared";

/** PUT .../notifications/preferences: save several categories at once (all or nothing). SMS cannot be switched on. */
export async function PUT(request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  return sendBody(request, params, "PUT", "/preferences", ["items"]);
}

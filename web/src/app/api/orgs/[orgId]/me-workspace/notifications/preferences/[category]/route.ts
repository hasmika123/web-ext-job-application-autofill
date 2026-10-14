import { sendBody } from "../../_bff/shared";

/** PUT .../notifications/preferences/{category}: save one category's preference (only the fields sent change). SMS cannot be switched on. */
export async function PUT(request: Request, { params }: { params: Promise<{ orgId: string; category: string }> }) {
  return sendBody(request, params, "PUT", "/preferences", ["enabled", "email", "inApp", "sms"]);
}

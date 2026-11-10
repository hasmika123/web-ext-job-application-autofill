import { setNotify } from "../_bff/shared";

/** PUT /api/orgs/{orgId}/me-workspace/inbox/notify `{ email }`: emails about interviews and offers on or off. */
export async function PUT(request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  return setNotify(request, params);
}

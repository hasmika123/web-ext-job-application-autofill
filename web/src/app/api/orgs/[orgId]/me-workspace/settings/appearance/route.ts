import { putSettings } from "../_bff/shared";

/** PUT /api/orgs/{orgId}/me-workspace/settings/appearance: theme, language label and time zone. */
export async function PUT(request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  return putSettings(request, params, "/appearance");
}

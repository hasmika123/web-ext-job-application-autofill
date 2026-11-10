import { reviewSettingsGet, reviewSettingsPut } from "../_bff/review";

/** GET / PUT /api/orgs/{orgId}/me-workspace/inbox/settings `{ applyRejectionsAutomatically }`. */
export async function GET(_request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  return reviewSettingsGet(params);
}

export async function PUT(request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  return reviewSettingsPut(request, params);
}

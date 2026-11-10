import { actOnSuggestion } from "../../../_bff/shared";

/** POST /api/orgs/{orgId}/me-workspace/inbox/suggestions/{id}/(accept|dismiss): put a suggested job on the board, or hide it. */
export async function POST(request: Request, { params }: { params: Promise<{ orgId: string; suggestionId: string; action: string }> }) {
  return actOnSuggestion(request, params);
}

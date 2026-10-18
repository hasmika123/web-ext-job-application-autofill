import { connectInbox, disconnectInbox, readInbox } from "./_bff/shared";

/**
 * GET    /api/orgs/{orgId}/me-workspace/inbox  the consultant's own Inbox page (connection without its password, suggestions, applications the mail moved).
 * POST   /api/orgs/{orgId}/me-workspace/inbox  connect a Gmail: `{ address, appPassword }`, checked against Gmail by the API and kept only encrypted.
 * DELETE /api/orgs/{orgId}/me-workspace/inbox  disconnect: the connection, its password and every message read from it are deleted.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  return readInbox(params);
}

export async function POST(request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  return connectInbox(request, params);
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  return disconnectInbox(params);
}

import { actOnReview, getInboxSettings, listReview, putInboxSettings, refNotFound, undoInbox } from "@/lib/inbox-review-bff";

/** The consultant workspace half of "Needs your review". The organization id in the path is the one the page was served for; the API checks it against the host and answers the generic 404 for anyone but the consultant. */
const isOrg = (v: string): boolean => /^\d{1,18}$/.test(v);
const inboxBase = (orgId: string) => `/api/orgs/${orgId}/me-workspace/inbox`;

export async function reviewList(params: Promise<{ orgId: string }>): Promise<Response> {
  const { orgId } = await params;
  return isOrg(orgId) ? listReview(inboxBase(orgId)) : refNotFound();
}

export async function reviewAct(request: Request, params: Promise<{ orgId: string; id: string; action: string }>): Promise<Response> {
  const { orgId, id, action } = await params;
  return isOrg(orgId) ? actOnReview(request, inboxBase(orgId), id, action) : refNotFound();
}

export async function reviewSettingsGet(params: Promise<{ orgId: string }>): Promise<Response> {
  const { orgId } = await params;
  return isOrg(orgId) ? getInboxSettings(inboxBase(orgId)) : refNotFound();
}

export async function reviewSettingsPut(request: Request, params: Promise<{ orgId: string }>): Promise<Response> {
  const { orgId } = await params;
  return isOrg(orgId) ? putInboxSettings(request, inboxBase(orgId)) : refNotFound();
}

export async function reviewUndo(params: Promise<{ orgId: string; applicationId: string; eventId: string }>): Promise<Response> {
  const { orgId, applicationId, eventId } = await params;
  return isOrg(orgId) ? undoInbox(`/api/orgs/${orgId}/me-workspace/applications`, applicationId, eventId) : refNotFound();
}

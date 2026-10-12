/**
 * Joining an organization and what a member shares with it (APP-E2E O2.2 / O6.2 / O2.3): the types of the join preview
 * and the consent, plus the browser-side calls. The calls go through the Next BFF (`/api/join/**`, `/api/me/orgs/**`),
 * which relays Spring's answers; they never throw and speak the small tagged result of `lib/org-client.ts`.
 */
import { orgCall, type OrgResult } from "@/lib/org-client";

export type ShareScope = "NONE" | "SUMMARY" | "FULL";
export type OrgRoleName = "OWNER" | "ADMIN" | "STAFF" | "MEMBER" | "MARKETER" | "FINANCE" | "COACH";

/** One row of the visibility matrix: a kind of fact and the least open scope that shows it (null = no scope ever does). */
export interface ConsentRow {
  field: string;
  label: string;
  minScope: ShareScope | null;
}

/** The consent a person is shown before choosing (`OrgConsentDTO`). */
export interface Consent {
  version: string;
  defaultScope: ShareScope;
  options: ShareScope[];
  matrix: ConsentRow[];
  text: string;
}

/** What a join link shows before anyone signs in (`JoinPreviewDTO`). */
export interface JoinPreview {
  source: "EMAIL" | "CODE";
  orgName: string;
  orgSlug: string;
  role: OrgRoleName;
  inviterName: string | null;
  groupName: string | null;
  pays: string[];
  expiresAt: string | null;
  open: boolean;
  consent: Consent;
}

/** `JoinResultDTO`: the person is in. */
export interface JoinResult {
  orgId: number;
  orgSlug: string;
  orgName: string;
  memberId: number;
  role: OrgRoleName;
  shareScope: ShareScope;
  pays: string[];
}

/** `MyOrgDTO`: one organization from the member's side. */
export interface MyOrg {
  org: { id: number; slug: string; name: string; status: string };
  memberId: number;
  role: OrgRoleName;
  status: string;
  scope: ShareScope;
  effectiveScope: ShareScope;
  consentVersion: string | null;
  fullTo: { memberId: number; name: string | null } | null;
  since: string | null;
  scopeChangedAt: string | null;
  sees: string[];
  neverSees: string[];
  canLeave: boolean;
  canChangeScope: boolean;
}

/** How a role reads in a sentence ("invited as a member"). */
export const ROLE_PHRASE: Record<OrgRoleName, string> = {
  OWNER: "the owner",
  ADMIN: "an admin",
  STAFF: "a support owner",
  MEMBER: "a member",
  MARKETER: "a marketer",
  FINANCE: "finance",
  COACH: "a coach",
};

/** The two choices the join screen offers (FULL is never one of them: it needs a named person). */
export const JOIN_SCOPES: Exclude<ShareScope, "FULL">[] = ["SUMMARY", "NONE"];

/** `/join/t/<token>` or `/join/<slug>/<code>`: what a link opens. */
export type JoinLink = { kind: "token"; token: string } | { kind: "code"; slug: string; code: string };

/** The page a join link lives at (also where sign-in sends the person back to). */
export function joinPath(link: JoinLink): string {
  return link.kind === "token" ? `/join/t/${encodeURIComponent(link.token)}` : `/join/${encodeURIComponent(link.slug)}/${encodeURIComponent(link.code)}`;
}

/** Accept the invite or join with the code, with the choice made on the consent screen. */
export function acceptJoin(link: JoinLink, scope: Exclude<ShareScope, "FULL">, consentVersion: string): Promise<OrgResult<JoinResult>> {
  const url = link.kind === "token" ? `/api/join/${encodeURIComponent(link.token)}/accept` : `/api/join/code/${encodeURIComponent(link.code)}`;
  return orgCall<JoinResult>("POST", url, { shareScope: scope, consentVersion });
}

export function fetchMyOrgs(): Promise<OrgResult<MyOrg[]>> {
  return orgCall<MyOrg[]>("GET", "/api/me/orgs");
}

/** Change what the caller shares with one org. `fullToMemberId` is only for FULL. */
export function changeShare(orgId: number, scope: ShareScope, consentVersion: string, fullToMemberId?: number): Promise<OrgResult<MyOrg>> {
  return orgCall<MyOrg>("PUT", `/api/me/orgs/${orgId}/share`, { scope, consentVersion, ...(fullToMemberId ? { fullToMemberId } : {}) });
}

export function leaveOrg(orgId: number): Promise<OrgResult<void>> {
  return orgCall<void>("POST", `/api/me/orgs/${orgId}/leave`, undefined, false);
}

/** The words for a scope, as a person reads them. */
export const SCOPE_WORDS: Record<ShareScope, { title: string; short: string }> = {
  NONE: { title: "Only that I joined", short: "Only that you joined" },
  SUMMARY: { title: "Progress summary", short: "A progress summary" },
  FULL: { title: "Everything, with one named person", short: "Everything, with one person" },
};

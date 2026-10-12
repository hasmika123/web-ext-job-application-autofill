/**
 * What the web knows about organizations (O1.6): the shapes of `GET /api/orgs/mine` and `GET /api/orgs/{id}`, and the
 * pure gate decision the `(org)` layout makes from them. No `next/*` import, so client components and unit tests can
 * use it. The server side (cookie, fetches) is `lib/org.ts`.
 *
 * The web gates its UI on `permissions[]`; the server never trusts that list (every `/api/orgs/{id}/**` handler checks
 * again and answers a generic 404).
 */

/** A numeric org id in a URL segment. */
export const ORG_ID = /^\d+$/;

export type OrgRole = "OWNER" | "ADMIN" | "STAFF" | "MEMBER" | "MARKETER" | "FINANCE" | "COACH";
export type OrgStatus = "DRAFT" | "PENDING_SETUP_FEE" | "ACTIVE" | "PAST_DUE" | "SUSPENDED" | "CLOSED";
export type OrgType = "COMPANY" | "SCHOOL" | "BOOTCAMP" | "OUTPLACEMENT" | "CONSULTANCY";

/** One row of `GET /api/orgs/mine`: an org the caller is an ACTIVE member of. */
export interface OrgMine {
  orgId: number;
  slug: string;
  name: string;
  role: OrgRole;
  status: OrgStatus;
  memberCount: number;
}

/** The org as the API describes it (billing email and settings only for roles that may see them). */
export interface OrgInfo {
  id: number;
  slug: string;
  name: string;
  type: OrgType;
  status: OrgStatus;
  website: string | null;
  sizeBand: string | null;
  country: string | null;
  timezone: string;
  billingEmail: string | null;
  settings: Record<string, unknown> | null;
  createdAt: string | null;
  closedAt: string | null;
}

/** `GET /api/orgs/{orgId}`. */
export interface OrgDetail {
  org: OrgInfo;
  me: { memberId: number; role: OrgRole; permissions: string[] };
  memberCount: number;
  status: OrgStatus;
}

/**
 * What the layout hands the shell and every org page (through `useOrg()`): the org, who the caller is in it, and the
 * permission keys the nav and the buttons are gated on.
 */
export interface CurrentOrg {
  org: OrgInfo;
  role: OrgRole;
  permissions: string[];
  memberCount: number;
}

/** A role that gets the admin console: everything except a plain MEMBER (whose org surface is /settings/organizations). */
export function seesConsole(role: OrgRole): boolean {
  return role !== "MEMBER" && role !== "COACH";
}

/** True when the permission list holds `key` (a `members.invite`-style key, or `ops.*`). */
export function can(permissions: readonly string[], key: string): boolean {
  return permissions.includes(key);
}

/** True when the list holds at least one of `keys`. */
export function canAny(permissions: readonly string[], keys: readonly string[]): boolean {
  return keys.some((k) => permissions.includes(k));
}

export type OrgGateDecision =
  /** Signed in, but in no org: the create flow. */
  | { kind: "none" }
  /** Only plain MEMBER seats: members never see the admin shell. */
  | { kind: "member-only" }
  /** Show the console for `current`; `orgs` is every org the caller can open (the switcher's list). */
  | { kind: "render"; orgs: OrgMine[]; current: OrgMine };

/**
 * The §2.2 branches, from `GET /api/orgs/mine` and the `kiwiply_org` cookie: no memberships -> none; MEMBER-only ->
 * member-only; otherwise the console, on the cookie's org when the caller still administers it and on the first one
 * (the API sorts by name) when the cookie is missing, stale or forged.
 */
export function decideOrgGate(mine: readonly OrgMine[], cookieOrgId?: string | null): OrgGateDecision {
  if (mine.length === 0) return { kind: "none" };
  const orgs = mine.filter((m) => seesConsole(m.role) && m.status !== "CLOSED");
  // Plain MEMBER seats, or console seats that are all in closed orgs: nothing to open, and the person is not "new",
  // so they are sent to their own dashboard rather than offered the create flow.
  if (orgs.length === 0) return { kind: "member-only" };
  const wanted = cookieOrgId && /^\d+$/.test(cookieOrgId) ? Number(cookieOrgId) : null;
  const current = orgs.find((o) => o.orgId === wanted) ?? orgs[0];
  return { kind: "render", orgs, current };
}

/** `GET /api/orgs/{id}/billing` (E2E-O4.0): the skeleton until org billing ships (Wave 5). */
export interface OrgBilling {
  status: OrgStatus;
  /** Stripe is connected in this environment. */
  billingEnabled: boolean;
  /** The OWNER may activate a DRAFT workspace without paying (billing off, dev/CI/demo only). */
  devActivation: boolean;
  subscription: unknown | null;
  items: unknown[];
  invoices: unknown[];
}

/** One row of the activation checklist (`GET /api/orgs/{id}/onboarding`, onboarding-invites.md section 5). */
export interface OnboardingItem {
  key: "activate" | "groups" | "profile" | "admins" | "invite" | "plans" | "owners" | "domain";
  done: boolean;
  /** The live number behind the row ("38" of 60 joined), null when it has none. */
  count: number | null;
  total: number | null;
  href: string;
  /** The action it points at exists in this build; false rows are shown as "soon", never as a dead link. */
  available: boolean;
  /** Optional rows do not count towards completion. */
  optional: boolean;
}

export interface OrgOnboarding {
  items: OnboardingItem[];
  done: number;
  total: number;
  complete: boolean;
}

/** `GET /api/orgs/{id}/overview`: seat counts and the progress of the members who share (never an employer, a title or a document). */
export interface OrgOverview {
  seats: { total: number; active: number; invited: number; sharing: number };
  groups: number;
  applications: {
    submitted30d: number;
    interviewing: number;
    offers: number;
    placedMembers: number;
    upcomingInterviews: number;
    pipeline: { stage: string; count: number }[];
  };
  recent: { id: number; at: string; action: string; targetType: string; mine: boolean }[];
}

/** `GET /api/orgs/{id}/groups`. */
export interface OrgGroup {
  id: number;
  name: string;
  kind: "DEPARTMENT" | "COHORT" | "TEAM";
  sortOrder: number;
  memberCount: number;
}

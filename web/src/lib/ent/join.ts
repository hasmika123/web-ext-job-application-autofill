/**
 * The tenant invitation page's contract (S9, decision O4): the preview the API shows before anyone signs in, the scopes the
 * consent step offers, the password rule and the mapping of the API's refusals to calm words. Pure: no I/O.
 *
 * For an invitation to a SEPARATE organization `createsAccount` is true: accepting creates the person's enterprise account of THAT
 * organization with the password chosen here. It never reads, attaches or reveals a personal Kiwiply account. For a legacy (shared
 * account) organization `createsAccount` is false: the person must already be signed in on this host.
 */
export type ShareScope = "NONE" | "SUMMARY";

export interface JoinConsent {
  version: string;
  defaultScope: ShareScope;
  options: ShareScope[];
  text?: string | null;
}

export interface JoinPreview {
  source: string;
  orgName: string;
  orgSlug: string;
  role?: string | null;
  inviterName?: string | null;
  groupName?: string | null;
  pays?: string[];
  expiresAt?: string | null;
  open: boolean;
  consent: JoinConsent;
  roles?: string[];
  department?: string | null;
  team?: string | null;
  message?: string | null;
  invitedEmailMasked?: string | null;
  createsAccount: boolean;
}

/** The platform password rule (4-100 characters on the wire); the API enforces it, this only keeps the button honest. */
export const JOIN_PASSWORD_MIN = 4; // config-literal-ok: mirrors ManagedUserVM.PASSWORD_MIN_LENGTH
export const JOIN_PASSWORD_MAX = 100; // config-literal-ok: mirrors the other end of the same rule

/** Why the chosen password cannot be sent yet, or null. */
export function newPasswordProblem(password: string, again: string): string | null {
  if (password.length < JOIN_PASSWORD_MIN) return `Choose a password of at least ${JOIN_PASSWORD_MIN} characters.`;
  if (password.length > JOIN_PASSWORD_MAX) return `Choose a password of at most ${JOIN_PASSWORD_MAX} characters.`;
  if (password !== again) return "The two passwords do not match.";
  return null;
}

export const SCOPE_COPY: Record<ShareScope, { title: string; detail: string }> = {
  NONE: { title: "Only that I joined", detail: "The organization sees that you are a member and nothing else." },
  SUMMARY: { title: "A summary", detail: "The organization sees counts and states of your activity, never your resumes or messages." },
};

export function isShareScope(v: unknown): v is ShareScope {
  return v === "NONE" || v === "SUMMARY";
}

/** Parses the API's preview body defensively; null when it is not the shape we render. */
export function parsePreview(raw: unknown): JoinPreview | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const c = o.consent as Record<string, unknown> | undefined;
  if (typeof o.orgName !== "string" || !c || typeof c.version !== "string") return null;
  const options = Array.isArray(c.options) ? (c.options as unknown[]).filter(isShareScope) : [];
  const defaultScope: ShareScope = isShareScope(c.defaultScope) ? c.defaultScope : "NONE";
  const strings = (v: unknown): string[] => (Array.isArray(v) ? (v as unknown[]).filter((x): x is string => typeof x === "string") : []);
  const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
  return {
    source: String(o.source ?? "EMAIL"),
    orgName: o.orgName,
    orgSlug: String(o.orgSlug ?? ""),
    role: str(o.role),
    inviterName: str(o.inviterName),
    groupName: str(o.groupName),
    pays: strings(o.pays),
    expiresAt: str(o.expiresAt),
    open: o.open !== false,
    consent: { version: c.version, defaultScope, options: options.length ? options : ["NONE", "SUMMARY"], text: str(c.text) },
    roles: strings(o.roles),
    department: str(o.department),
    team: str(o.team),
    message: str(o.message),
    invitedEmailMasked: str(o.invitedEmailMasked),
    createsAccount: o.createsAccount === true,
  };
}

/** The calm sentence for a refused accept. Never says anything about other accounts. */
export function acceptRefusal(status: number, code?: string): string {
  if (code === "ALREADY_MEMBER") return "This address is already a member of this organization. Sign in instead.";
  if (code === "INVITE_EXPIRED") return "This invitation has expired. Ask the person who invited you to send a new one.";
  if (code === "SEAT_STATE") return "This invitation can no longer be used. Ask the person who invited you for a new one.";
  if (status === 404) return "This invitation link is not valid any more.";
  if (status === 429) return "Too many attempts. Wait a moment and try again.";
  if (status === 401 || status === 403) return "Sign in to this workspace first, then open the invitation again.";
  if (status >= 500) return "Something went wrong on our side. Nothing was changed. Try again.";
  return "The invitation could not be accepted. Check the password and try again.";
}

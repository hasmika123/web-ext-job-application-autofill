/**
 * Terms acceptance (T0.2), web side. The API keeps the record (`GET/POST /api/account/terms-acceptance`); sign-up records both documents when the account is created,
 * and a signed-in person is asked to accept a NEW version through the banner. These helpers turn the API's status into what the banner needs.
 */

export type LegalDocument = "TERMS" | "PRIVACY";

export interface DocStatus {
  currentVersion: string;
  accepted: boolean;
  lastAcceptedVersion: string | null;
}

export interface TermsStatus {
  terms: DocStatus;
  privacy: DocStatus;
  upToDate: boolean;
}

function doc(v: unknown): DocStatus | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (typeof o.currentVersion !== "string" || typeof o.accepted !== "boolean") return null;
  return { currentVersion: o.currentVersion, accepted: o.accepted, lastAcceptedVersion: typeof o.lastAcceptedVersion === "string" ? o.lastAcceptedVersion : null };
}

/** The API's status, or null when it is not in the expected shape (the banner then stays away rather than guess). */
export function parseTermsStatus(raw: unknown): TermsStatus | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const terms = doc(o.terms);
  const privacy = doc(o.privacy);
  if (!terms || !privacy) return null;
  return { terms, privacy, upToDate: o.upToDate === true };
}

/** The documents still to accept, with the version in force. */
export function pendingDocuments(s: TermsStatus): Array<{ document: LegalDocument; version: string }> {
  const out: Array<{ document: LegalDocument; version: string }> = [];
  if (!s.terms.accepted) out.push({ document: "TERMS", version: s.terms.currentVersion });
  if (!s.privacy.accepted) out.push({ document: "PRIVACY", version: s.privacy.currentVersion });
  return out;
}

/** True when the person has accepted an earlier version of what changed (the banner then says "updated"); false when there is no record at all. */
export function isUpdate(s: TermsStatus): boolean {
  return (!s.terms.accepted && s.terms.lastAcceptedVersion !== null) || (!s.privacy.accepted && s.privacy.lastAcceptedVersion !== null);
}

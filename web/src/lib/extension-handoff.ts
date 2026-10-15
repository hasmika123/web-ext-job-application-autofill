/**
 * The session the `/connect` page hands to the browser extension (decision O4, docs/enterprise-v2/19 section 6.3).
 *
 * The API returns `{accessToken, refreshToken, kind, userId, email, orgId, orgName, username}` for both ways of getting a session (a personal
 * one from the signed-in personal cookie, an enterprise one from a one-time connect code). The extension reads the same object inside the
 * `tokens` of its `KIWIPLY_CONNECT` message, next to `access` and `refresh`. Pure, so the BFF route and its test share one definition.
 *
 * An ENTERPRISE handoff is only valid with a positive integer `orgId` AND `userId` (the extension refuses anything else); the enterprise login
 * (`ent#...`) is never sent, so there is no `username` for it.
 */
export type HandoffKind = "PERSONAL" | "ENTERPRISE";

export interface HandoffTokens {
  access: string;
  refresh: string;
  kind: HandoffKind;
  userId?: number;
  email?: string;
  orgId?: number;
  orgName?: string;
  /** Personal accounts only: the "Connected as ..." label of older extension builds. */
  username?: string;
}

const positiveInt = (v: unknown): number | undefined => (typeof v === "number" && Number.isSafeInteger(v) && v > 0 ? v : undefined);
const text = (v: unknown, max: number): string | undefined => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);

/** The handoff object for an API session response, or null when it is malformed (the route answers 502). */
export function handoffFrom(data: unknown, usernameFallback?: string): HandoffTokens | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (typeof d.accessToken !== "string" || !d.accessToken || typeof d.refreshToken !== "string" || !d.refreshToken) return null;
  const kind: HandoffKind = d.kind === "ENTERPRISE" ? "ENTERPRISE" : "PERSONAL";
  const userId = positiveInt(d.userId);
  const email = text(d.email, 191);
  if (kind === "ENTERPRISE") {
    const orgId = positiveInt(d.orgId);
    if (!orgId || !userId) return null;
    return { access: d.accessToken, refresh: d.refreshToken, kind, userId, email, orgId, orgName: text(d.orgName, 200) };
  }
  return { access: d.accessToken, refresh: d.refreshToken, kind, userId, email, username: text(d.username, 191) ?? usernameFallback };
}

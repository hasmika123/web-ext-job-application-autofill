import { redirect } from "next/navigation";
import { hasSession } from "@/lib/auth";
import { serverApiFetch } from "@/lib/api";
import AppShell, { type AppAccount } from "@/components/app-shell/AppShell";

/**
 * Shell for all authed app routes (dashboard/profile/resumes/board/settings).
 * Gates the session ONCE here (replacing the per-page `hasSession()` checks) and
 * renders the persistent sidebar + mobile drawer. The account is fetched for the
 * sidebar user chip; individual pages still fetch their own data.
 *
 * Gating is two-stage so a protected page is never reachable without a *valid* login:
 *   1. No session cookie at all → redirect immediately (cheap, skips the API call).
 *   2. Cookie present but the token is rejected by the API (forged, tampered, or — the
 *      common case — the access token expired while the 30-day cookie lingers) → the
 *      `/api/account` probe returns 401, so we redirect rather than render the shell.
 * A non-401 failure (server down, network) is left to error normally — it must NOT be
 * treated as "signed out", and it still doesn't leak data (the shell renders empty).
 */
export default async function AppGroupLayout({ children }: { children: React.ReactNode }) {
  if (!(await hasSession())) {
    redirect("/login");
  }

  let account: AppAccount | null = null;
  const res = await serverApiFetch("/api/account");
  if (res.status === 401 || res.status === 403) {
    redirect("/login");
  }
  if (res.ok) {
    account = (await res.json().catch(() => null)) as AppAccount | null;
  }

  return <AppShell account={account}>{children}</AppShell>;
}

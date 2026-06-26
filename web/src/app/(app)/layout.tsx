import { redirect } from "next/navigation";
import { hasSession } from "@/lib/auth";
import { serverApiFetch } from "@/lib/api";
import AppShell, { type AppAccount } from "@/components/app-shell/AppShell";

/**
 * Shell for all authed app routes (dashboard/profile/resumes/board/settings).
 * Gates the session ONCE here (replacing the per-page `hasSession()` checks) and
 * renders the persistent sidebar + mobile drawer. The account is fetched for the
 * sidebar user chip; individual pages still fetch their own data.
 */
export default async function AppGroupLayout({ children }: { children: React.ReactNode }) {
  if (!(await hasSession())) {
    redirect("/login");
  }

  let account: AppAccount | null = null;
  const res = await serverApiFetch("/api/account");
  if (res.ok) {
    account = (await res.json().catch(() => null)) as AppAccount | null;
  }

  return <AppShell account={account}>{children}</AppShell>;
}

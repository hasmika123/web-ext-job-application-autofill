import { notFound, redirect } from "next/navigation";
import { hasSession } from "@/lib/auth";
import { serverApiFetch } from "@/lib/api";
import AdminShell, { type AdminAccount } from "@/components/admin-shell/AdminShell";

/**
 * Gate for the admin console (Phase 9.A1). This is a UX gate — the real enforcement is
 * server-side (Spring locks `/api/admin/**` to ROLE_ADMIN, SecurityConfiguration), so even
 * if this layout were bypassed no admin data is reachable.
 *
 *   1. No session cookie → /login (cheap, skips the API call).
 *   2. Cookie present but rejected (expired/forged) → /login.
 *   3. Authenticated but NOT ROLE_ADMIN → 404 (notFound) — we don't reveal that /admin exists.
 *   4. Couldn't confirm (API down / unexpected) → 404, fail closed rather than render the shell.
 */
export default async function AdminGroupLayout({ children }: { children: React.ReactNode }) {
  if (!(await hasSession())) {
    redirect("/login");
  }

  const res = await serverApiFetch("/api/account");
  if (res.status === 401 || res.status === 403) {
    redirect("/login");
  }
  if (!res.ok) {
    notFound();
  }

  const account = (await res.json().catch(() => null)) as AdminAccount | null;
  const isAdmin = Array.isArray(account?.authorities) && account.authorities.includes("ROLE_ADMIN");
  if (!isAdmin) {
    notFound();
  }

  return <AdminShell account={account}>{children}</AdminShell>;
}

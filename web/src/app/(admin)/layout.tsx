import { notFound, redirect } from "next/navigation";
import { Caveat, Plus_Jakarta_Sans } from "next/font/google";
import { hasSession } from "@/lib/auth";
import { serverApiFetch } from "@/lib/api";
import AdminShell, { type AdminAccount } from "@/components/admin-shell/AdminShell";

// Same display + handwriting faces as the (app) group; the variables live on the `.theme-v2` wrapper.
const jakarta = Plus_Jakarta_Sans({ weight: ["700", "800"], subsets: ["latin"], variable: "--font-jakarta", display: "swap" });
const caveat = Caveat({ weight: "600", subsets: ["latin"], variable: "--font-caveat", display: "swap" });

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

  // Admin v3 look: "Kiwiply Bright" tokens (`.theme-v2`), same as the signed-in app.
  return (
    <div className={`theme-v2 ${jakarta.variable} ${caveat.variable} flex flex-1 flex-col`}>
      <AdminShell account={account}>{children}</AdminShell>
    </div>
  );
}

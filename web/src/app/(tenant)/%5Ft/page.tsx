import { redirect } from "next/navigation";
import { destinationFor, getTenantSession } from "@/lib/ent/tenant-session";
import { getTenant } from "@/lib/tenant";

/**
 * The tenant root (X2.6): login-first. The proxy already sent a signed-out visitor to `/login`; here a signed-in member goes
 * straight to the landing the API names (`GET /api/me/tenant.landing`, X2.2), and a token the API refuses (another tenant's,
 * expired) goes to the sign-in. While X2.2 is not built (`UNAVAILABLE`) the member sees the welcome skeleton below.
 */
export default async function TenantHome() {
  const t = await getTenant();
  if (t.kind !== "TENANT") return null; // the layout already answered 404
  const session = await getTenantSession();
  if (session.kind === "UNAUTHENTICATED") redirect("/login");
  const to = destinationFor(session);
  if (to && to !== "/") redirect(to);

  if (session.kind === "SUSPENDED") {
    return (
      <main className="mx-auto w-full max-w-xl px-4 py-16" data-tenant-paused>
        <h1 className="text-2xl font-semibold text-ink">Your access is paused</h1>
        <p className="mt-2 text-muted">Ask your {t.tenant.displayName} administrator to restore it.</p>
      </main>
    );
  }
  if (session.kind === "NOT_A_MEMBER") {
    return (
      <main className="mx-auto w-full max-w-xl px-4 py-16" data-tenant-not-a-member>
        <h1 className="text-2xl font-semibold text-ink">You&apos;re not a member of this workspace</h1>
        <p className="mt-2 text-muted">Sign in with the account {t.tenant.displayName} invited, or ask them for an invitation.</p>
      </main>
    );
  }
  const title = t.tenant.branding?.welcomeTitle || `Welcome to ${t.tenant.displayName}`;
  return (
    <main className="mx-auto w-full max-w-xl px-4 py-16">
      <h1 className="text-2xl font-semibold text-ink">{title}</h1>
      {t.tenant.branding?.welcomeMessage ? <p className="mt-2 text-muted">{t.tenant.branding.welcomeMessage}</p> : null}
    </main>
  );
}

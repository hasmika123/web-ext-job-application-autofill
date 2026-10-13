import type { Metadata } from "next";
import TenantLogo from "@/components/ent/login/TenantLogo";
import { getTenant } from "@/lib/tenant";

export const metadata: Metadata = { title: "Reset your password" };

/**
 * Interim "Forgot Password?" target on a tenant host (the sign-in links here). Password reset for organization accounts
 * (mail links built on the tenant host, `TenantUrls`) is the identity story X2.9/X2.10: until it lands this page tells the
 * person who can help instead of 404ing, using the organization's own published support address.
 */
export default async function TenantForgotPassword() {
  const t = await getTenant();
  if (t.kind !== "TENANT") return null;
  const b = t.tenant.branding;
  return (
    <main className="tenant-sky grid min-h-dvh place-items-center px-4 py-10 text-[var(--brand-900)]">
      <div className="tenant-card w-full max-w-[520px] rounded-[24px] bg-white px-6 py-9 text-center sm:px-10">
        <div className="mb-6 flex justify-center">
          <TenantLogo name={t.tenant.displayName} logoUrl={b?.logoUrl} />
        </div>
        <h1 className="font-body text-[28px] font-extrabold leading-tight tracking-tight">Reset your password</h1>
        <p className="mx-auto mt-3 max-w-[36ch] text-[16px] leading-snug text-v2-ink-soft">
          {b?.supportEmail ? (
            <>
              Ask {t.tenant.displayName} IT Support to reset it for you:{" "}
              <a href={`mailto:${b.supportEmail}`} className="font-semibold text-accent-deep hover:underline">
                {b.supportEmail}
              </a>
              .
            </>
          ) : (
            <>Ask your {t.tenant.displayName} administrator to reset it for you.</>
          )}
        </p>
        <a href="/login" className="mt-6 inline-flex min-h-[44px] items-center justify-center font-semibold text-accent-deep hover:underline">
          Back to sign in
        </a>
      </div>
    </main>
  );
}

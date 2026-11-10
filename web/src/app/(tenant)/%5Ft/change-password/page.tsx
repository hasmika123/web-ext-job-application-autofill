import type { Metadata } from "next";
import ForcedPasswordChange from "@/components/ent/login/ForcedPasswordChange";
import { getTenant } from "@/lib/tenant";

/**
 * The forced password change (owner and employee onboarding with a temporary password): `acme.localhost/change-password` is
 * rewritten here by `proxy.ts`. It reads only the PUBLISHED branding (no tenant-session call: the API refuses every other call while
 * the temporary password stands). A signed-out visitor never gets here: the proxy sends them to the sign-in first.
 */
export const metadata: Metadata = { title: "Choose your password" };

export default async function TenantChangePasswordPage() {
  const t = await getTenant();
  if (t.kind !== "TENANT") return null; // the layout already answered
  return <ForcedPasswordChange name={t.tenant.displayName} logoUrl={t.tenant.branding?.logoUrl} />;
}

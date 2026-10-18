import type { Metadata } from "next";
import { TenantForgotPassword } from "@/components/ent/login/TenantPasswordReset";
import { getTenant } from "@/lib/tenant";

export const metadata: Metadata = { title: "Reset your password" };

/**
 * "Forgot password?" on a tenant host (S9, decision O4; replaces the interim "ask your administrator" page). The BFF forwards this host, so the
 * API resets the person's account of THIS organization only and mails a link on this host. Same answer whether or not an account exists.
 */
export default async function TenantForgotPasswordPage() {
  const t = await getTenant();
  if (t.kind !== "TENANT") return null;
  return <TenantForgotPassword name={t.tenant.displayName} logoUrl={t.tenant.branding?.logoUrl} supportEmail={t.tenant.branding?.supportEmail} />;
}

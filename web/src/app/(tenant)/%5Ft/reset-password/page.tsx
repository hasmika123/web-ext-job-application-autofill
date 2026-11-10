import type { Metadata } from "next";
import { TenantResetPassword } from "@/components/ent/login/TenantPasswordReset";
import { getTenant } from "@/lib/tenant";

export const metadata: Metadata = { title: "Set a new password", robots: { index: false, follow: false } };

/** The emailed reset link on a tenant host (`/reset-password?key=...`, a public tenant path). S9, O4: the key only resets this organization's account. */
export default async function TenantResetPasswordPage({ searchParams }: { searchParams: Promise<{ key?: string | string[] }> }) {
  const t = await getTenant();
  if (t.kind !== "TENANT") return null;
  const { key } = await searchParams;
  return <TenantResetPassword name={t.tenant.displayName} logoUrl={t.tenant.branding?.logoUrl} resetKey={typeof key === "string" ? key : ""} />;
}

import type { Metadata } from "next";
import BrandedLogin from "@/components/ent/login/BrandedLogin";
import { getTenant } from "@/lib/tenant";

/**
 * The tenant sign-in (X2.3): `acme.localhost/login` is rewritten here by `proxy.ts` (the tree lives at `%5Ft`). The tenant
 * layout already answered the unknown / unavailable hosts, so here the host is a served tenant and everything on the page
 * comes from its PUBLISHED branding. Title: "Sign in · {displayName}" (the layout's template).
 * EXISTING_SESSION redirect, the DRAFT_PREVIEW banner and the pending/suspended panels wait for the endpoints they read
 * (`/api/me/tenant`, X2.2; the 403 flags, X2.6).
 */
export const metadata: Metadata = { title: "Sign in" };

export default async function TenantLoginPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const t = await getTenant();
  if (t.kind !== "TENANT") return null; // the layout already answered
  const { next } = await searchParams;
  const b = t.tenant.branding;
  return (
    <BrandedLogin
      name={t.tenant.displayName}
      logoUrl={b?.logoUrl}
      welcomeTitle={b?.welcomeTitle}
      welcomeMessage={b?.welcomeMessage}
      supportEmail={b?.supportEmail}
      featureChips={b?.featureChips}
      microsoft={t.tenant.login?.microsoft === true}
      google={t.tenant.login?.google === true}
      next={typeof next === "string" ? next : undefined}
    />
  );
}

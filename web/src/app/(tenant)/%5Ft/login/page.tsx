import type { Metadata } from "next";
import { redirect } from "next/navigation";
import BrandedLogin from "@/components/ent/login/BrandedLogin";
import TenantDemoTab from "@/components/ent/login/TenantDemoTab";
import { destinationFor, getTenantSession } from "@/lib/ent/tenant-session";
import { getTenant } from "@/lib/tenant";

/**
 * The tenant sign-in (X2.3): `acme.localhost/login` is rewritten here by `proxy.ts` (the tree lives at `%5Ft`). The tenant
 * layout already answered the unknown / unavailable hosts, so here the host is a served tenant and everything on the page
 * comes from its PUBLISHED branding. Title: "Sign in · {displayName}" (the layout's template).
 * X2.6: a visitor who is already signed in (a tid-bound session the API accepts on THIS host) never sees the form: they go to
 * `?next=` (same-host paths only) or their landing. A token the API refuses (expired, another tenant's) shows the form.
 * The DRAFT_PREVIEW banner and the pending/suspended panels wait for their endpoints (X2.18, the 403 flags).
 */
export const metadata: Metadata = { title: "Sign in" };

export default async function TenantLoginPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const t = await getTenant();
  if (t.kind !== "TENANT") return null; // the layout already answered
  const { next } = await searchParams;
  const to = destinationFor(await getTenantSession(), next);
  if (to) redirect(to);
  const b = t.tenant.branding;
  return (
    <>
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
    {/* X1.12: the dev-style "Demo accounts" tab; renders nothing unless the API says DEMO_ENABLED + ENT_DEMO_SEED are on for this host. */}
    <TenantDemoTab />
    </>
  );
}

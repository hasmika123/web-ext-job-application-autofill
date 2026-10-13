import type { Metadata } from "next";
import Link from "next/link";
import BrandingPage from "@/components/ent/branding/BrandingPage";
import { EmptyState, ErrorState } from "@kiwiply/ui";
import { buttonVariants } from "@/components/ui/Button";
import { getTenant } from "@/lib/tenant";
import { resolveWorkspaceOrg } from "@/lib/ent/workspace-org";

/**
 * Organization Branding (X2.18) at `/w/{workspace}/branding` on a tenant host (the tree lives at `%5Ft`, see proxy.ts).
 *
 * The workspace shell (X2.16) does not exist yet, so this page carries a minimal standalone frame. What X2.16 must wire:
 * mount this route under the Org Admin area of the shell (section "Organization > Branding"), drop `Frame` below, take the
 * org from the tenant session instead of `resolveWorkspaceOrg()`, and gate the nav entry on `branding.manage`.
 */
export const metadata: Metadata = { title: "Branding", robots: { index: false, follow: false } };

function Frame({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-app-bg">
      <header className="border-b border-line bg-paper">
        <div className="mx-auto flex h-14 w-full max-w-7xl items-center px-4 sm:px-6">
          <span className="text-sm font-semibold text-ink">{name}</span>
          <span className="mx-2 text-muted" aria-hidden>
            /
          </span>
          <span className="text-sm text-muted">Organization admin</span>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6 sm:py-6">{children}</main>
    </div>
  );
}

export default async function WorkspaceBrandingRoute() {
  const t = await getTenant();
  if (t.kind !== "TENANT") return null; // the tenant layout already answered 404 / unavailable
  const name = t.tenant.displayName;
  const org = await resolveWorkspaceOrg();

  if (org.kind === "ok")
    return (
      <Frame name={name}>
        <BrandingPage orgId={org.orgId} orgName={name} />
      </Frame>
    );
  if (org.kind === "error")
    return (
      <Frame name={name}>
        <ErrorState what="your organization" description="Please refresh in a moment." />
      </Frame>
    );
  const signedOut = org.kind === "signed-out";
  return (
    <Frame name={name}>
      <EmptyState
        mascotPose={signedOut ? "welcome" : "peek"}
        title={signedOut ? "Sign in to manage branding" : "Branding isn't part of your role"}
        description={signedOut ? "Branding is for organization admins." : "Only organization admins can change how the portal looks."}
        action={
          signedOut ? (
            <Link href="/login?next=/w/admin/branding" className={buttonVariants("primary", "md")}>
              Sign in
            </Link>
          ) : undefined
        }
      />
    </Frame>
  );
}

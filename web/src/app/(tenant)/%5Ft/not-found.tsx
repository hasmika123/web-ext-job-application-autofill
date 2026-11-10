import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@kiwiply/ui";
import SetDocumentTitle from "@/components/ent/SetDocumentTitle";
import { getTenant } from "@/lib/tenant";

/**
 * A page that does not exist on a SERVED tenant host (the host itself is fine; the layout above rendered): the organization's own words, title and way back.
 * An unknown host never gets here (that is `(tenant)/not-found.tsx`, deliberately bare). Nothing here names Kiwiply.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTenant();
  // absolute: the platform's root title template ("Kiwiply | %s") must not wrap a tenant page title
  const title = t.kind === "TENANT" ? `Page not found · ${t.tenant.displayName}` : "Page not found";
  return { title: { absolute: title }, robots: { index: false, follow: false } };
}

export default async function TenantPageNotFound() {
  const t = await getTenant();
  const org = t.kind === "TENANT" ? t.tenant.displayName : "your workspace";
  return (
    <>
    <SetDocumentTitle title={t.kind === "TENANT" ? `Page not found · ${t.tenant.displayName}` : "Page not found"} />
    <main className="mx-auto flex min-h-[60vh] w-full max-w-xl items-center px-4 py-10" data-tenant-page-not-found>
      <EmptyState
        mascotPose="empty"
        title="This page doesn't exist"
        description={`The address may have changed, or it was never part of ${org}.`}
        action={
          <Link href="/" className="inline-flex min-h-11 items-center rounded-lg bg-accent px-4 text-[14px] font-semibold text-on-accent hover:brightness-95">
            Back to {org}
          </Link>
        }
        className="w-full"
      />
    </main>
    </>
  );
}

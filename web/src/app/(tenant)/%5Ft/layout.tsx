import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTenant } from "@/lib/tenant";

/**
 * Tenant tree (X1.4). `proxy.ts` rewrites every page path on a tenant host to `/_t/<path>` (the folder is `%5Ft`: a plain `_t` folder is a Next private folder and is not routable); this layout decides
 * what that host is:
 *   TENANT   -> render the children (the tenant's pages; Acme's name in the title)
 *   UNKNOWN  -> notFound(): HTTP 404, the generic TenantUnavailable page (`../not-found.tsx`)
 *   PLATFORM -> notFound(): the tenant tree is not served on a platform host
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTenant();
  if (t.kind !== "TENANT") return { title: { absolute: "Workspace not available" }, robots: { index: false, follow: false } };
  return { title: { absolute: t.tenant.displayName }, robots: { index: false, follow: false } };
}

export default async function TenantTreeLayout({ children }: { children: React.ReactNode }) {
  const t = await getTenant();
  if (t.kind !== "TENANT") notFound();
  return <div data-tenant-root>{children}</div>;
}

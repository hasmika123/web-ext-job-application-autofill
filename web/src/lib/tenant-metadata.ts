import type { Metadata } from "next";

/**
 * Page metadata for a served tenant (X2.13): title template "%s · {displayName}" (the default is the name alone), the
 * tenant's own favicon / apple-touch-icon from the same-origin asset route (the favicon, else the logo; a blank icon
 * when the org has neither, so Kiwiply's own icon is never shown on a tenant host), and no og:* (nothing on a tenant
 * host is for sharing or search).
 */
const BLANK_ICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1 1'%3E%3C/svg%3E";

export function tenantMetadata(tenant: { displayName: string; branding?: { faviconUrl?: string | null; logoUrl?: string | null } | null }): Metadata {
  const icon = tenant.branding?.faviconUrl || tenant.branding?.logoUrl || null;
  return {
    title: { template: `%s · ${tenant.displayName}`, default: tenant.displayName },
    applicationName: tenant.displayName,
    robots: { index: false, follow: false },
    icons: icon ? { icon, apple: icon } : { icon: BLANK_ICON },
  };
}

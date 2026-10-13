import type { Metadata } from "next";

/**
 * Page metadata for a served tenant (X2.13): title template "%s · {displayName}" (the default is the name alone), the
 * tenant's own favicon / apple-touch-icon from the same-origin asset route when one is published (else Kiwiply's
 * defaults apply), and no og:* (nothing on a tenant host is for sharing or search).
 */
export function tenantMetadata(tenant: { displayName: string; branding?: { faviconUrl?: string | null } | null }): Metadata {
  const favicon = tenant.branding?.faviconUrl;
  return {
    title: { template: `%s · ${tenant.displayName}`, default: tenant.displayName },
    robots: { index: false, follow: false },
    ...(favicon ? { icons: { icon: favicon, apple: favicon } } : {}),
  };
}

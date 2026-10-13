import type { Metadata } from "next";

// Nothing under a tenant host is for search engines until a tenant publishes a careers page (not in X1).
export const metadata: Metadata = { robots: { index: false, follow: false } };

/** Group layout: intentionally a pass-through. The tenant/unknown/platform decision lives in `_t/layout.tsx`. */
export default function TenantGroupLayout({ children }: { children: React.ReactNode }) {
  return children;
}

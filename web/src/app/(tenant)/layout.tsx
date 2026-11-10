import type { Metadata } from "next";
import { EnterpriseMascotProvider } from "@/lib/ent/mascot";

// Nothing under a tenant host is for search engines until a tenant publishes a careers page (not in X1).
export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * Group layout: the tenant/unknown/platform decision lives in `_t/layout.tsx`. This one only tells every `EmptyState` /
 * `ErrorState` `mascotPose` below where the ENTERPRISE bee art is served from (X2.8); it renders no markup of its own.
 */
export default function TenantGroupLayout({ children }: { children: React.ReactNode }) {
  return <EnterpriseMascotProvider>{children}</EnterpriseMascotProvider>;
}

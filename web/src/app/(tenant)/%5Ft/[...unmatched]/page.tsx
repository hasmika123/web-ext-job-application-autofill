import { notFound } from "next/navigation";

/**
 * Any path on a tenant host that no page owns ends here and becomes a real 404 INSIDE the tenant tree, so `../not-found.tsx` answers (the organization's own
 * frame, title and words) instead of the platform's default 404 with Kiwiply's name and icon (D15, 2026-10-16 audit). Static folders always win over this.
 */
export default function TenantUnmatched() {
  notFound();
}

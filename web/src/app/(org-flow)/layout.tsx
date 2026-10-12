import type { Metadata } from "next";
import { requireOrgSession } from "@/lib/org";
import { ORG_THEME_CLASS } from "@/components/org-v2/shell/org-fonts";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * The pages around the org console that must be reachable BEFORE the person has an organization (`/org/new`, the create
 * flow). They need the session and the org feature flag, but not a membership: the console layout (`(org)/layout.tsx`)
 * sends someone with no org here, so gating this one on a membership would loop.
 */
export default async function OrgFlowLayout({ children }: { children: React.ReactNode }) {
  await requireOrgSession();
  return <div className={`${ORG_THEME_CLASS} bg-v2-canvas`}>{children}</div>;
}

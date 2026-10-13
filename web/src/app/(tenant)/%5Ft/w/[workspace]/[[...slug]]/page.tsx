import type { Metadata } from "next";
import { ComingSoon, NotYourRole } from "@/components/ent/shell/ShellStates";
import { getTenantSession } from "@/lib/ent/tenant-session";
import { catchAllPage } from "@/lib/ent/shell";

/**
 * Every menu page that has no page of its own yet (X2.16): the sidebar must never lead to a 404. A page the member's menu lists
 * renders "This page is on the way" (with the bee); a path their menu does not list is "This isn't part of your role" (the API
 * is the real gate, this only avoids showing a page that is not theirs). Real pages are plain sibling folders and win over this.
 */
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function WorkspaceCatchAll({ params }: { params: Promise<{ workspace: string; slug?: string[] }> }) {
  const { workspace, slug } = await params;
  const session = await getTenantSession();
  if (session.kind !== "OK") return null; // the layout already showed the matching panel
  const hit = catchAllPage(session.me, workspace, slug ?? []);
  if (hit.kind === "page") return <ComingSoon title={hit.title} />;
  const other = session.me.workspaces.find((w) => w.home === session.me.landing) ?? session.me.workspaces[0];
  return <NotYourRole switchTo={other ? { label: other.label, href: other.home } : null} />;
}

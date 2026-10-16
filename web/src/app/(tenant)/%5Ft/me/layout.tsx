import WorkspaceLayout from "../w/[workspace]/layout";
import { getTenantSession } from "@/lib/ent/tenant-session";

/**
 * My profile (`/me`) is NOT a workspace page: every member has one, whatever their roles. It still lives in the organization's frame, so this layout is the
 * workspace layout with the workspace fixed to the member's landing one (their menu, the switcher, the sign-out and the paused / not-a-member states all
 * stay exactly as the shell defines them).
 */
export default async function MeLayout({ children }: { children: React.ReactNode }) {
  const session = await getTenantSession();
  const key = session.kind === "OK" ? (session.me.workspaces.find((w) => w.home === session.me.landing)?.key ?? session.me.workspaces[0]?.key ?? "admin") : "admin";
  return <WorkspaceLayout params={Promise.resolve({ workspace: key })}>{children}</WorkspaceLayout>;
}

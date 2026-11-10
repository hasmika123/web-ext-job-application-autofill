import WorkspaceLayout from "../[workspace]/layout";

/**
 * The Consultant workspace's real pages live in plain sibling folders under `/w/consultant/**` (they win over the `[workspace]`
 * catch-all) and share the same shell: this layout is the workspace layout with the workspace key fixed to `consultant`, so the
 * sign-in, paused, not-a-member and "not part of your role" states stay exactly as the shell defines them.
 */
export default function ConsultantWorkspaceLayout({ children }: { children: React.ReactNode }) {
  return <WorkspaceLayout params={Promise.resolve({ workspace: "consultant" })}>{children}</WorkspaceLayout>;
}

import type { Metadata } from "next";
import DashboardPage, { type DashboardData } from "@/components/org-v2/dashboard/DashboardPage";
import { loadOrgGate, orgFetch } from "@/lib/org";
import { can, type OrgOnboarding, type OrgOverview } from "@/lib/org-types";

export const metadata: Metadata = { title: "Dashboard · Organization" };

async function read<T>(path: string): Promise<T | null> {
  const res = await orgFetch(path);
  return res.ok ? ((await res.json().catch(() => null)) as T | null) : null;
}

/**
 * The first paint comes from the server, which resolves the org itself (the browser never sends an id). The checklist is for
 * the people who set the workspace up (`org.settings.manage`), the numbers for everyone who may read reports; a role that holds
 * neither key is not asked for either, so it never provokes a refusal.
 */
export default async function OrgDashboardRoute() {
  const gate = await loadOrgGate();
  const permissions = gate.kind === "render" ? gate.current.permissions : [];
  const [onboarding, overview] = await Promise.all([
    can(permissions, "org.settings.manage") ? read<OrgOnboarding>("/onboarding") : null,
    can(permissions, "reports.view") ? read<OrgOverview>("/overview") : null,
  ]);
  const initial: DashboardData = { onboarding, overview };
  return <DashboardPage initial={initial} />;
}

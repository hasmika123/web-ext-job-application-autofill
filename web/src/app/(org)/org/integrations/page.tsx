import type { Metadata } from "next";
import IntegrationsPage from "@/components/org-v2/integrations/IntegrationsPage";

export const metadata: Metadata = { title: "Integrations · Kiwiply for Organizations" };

export default function OrgIntegrationsRoute() {
  return <IntegrationsPage />;
}

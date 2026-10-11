import type { Metadata } from "next";
import IntegrationsPage from "@/components/org-v2/integrations/IntegrationsPage";

export const metadata: Metadata = { title: "Integrations · Organization" };

export default function OrgIntegrationsRoute() {
  return <IntegrationsPage />;
}

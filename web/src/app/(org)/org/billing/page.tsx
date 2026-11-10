import type { Metadata } from "next";
import BillingPage from "@/components/org-v2/billing/BillingPage";

export const metadata: Metadata = { title: "Billing & Subscription · Organization" };

export default function OrgBillingRoute() {
  return <BillingPage />;
}

import type { Metadata } from "next";
import BillingPage from "@/components/org-v2/billing/BillingPage";
import { orgFetch } from "@/lib/org";
import type { OrgBilling } from "@/lib/org-types";

export const metadata: Metadata = { title: "Billing & Subscription · Organization" };

/** First paint comes from the server (the org id is resolved there, never sent by the browser); the page refetches on Retry. */
export default async function OrgBillingRoute() {
  const res = await orgFetch("/billing");
  const initial = res.ok ? ((await res.json().catch(() => null)) as OrgBilling | null) : null;
  return <BillingPage initial={initial} />;
}

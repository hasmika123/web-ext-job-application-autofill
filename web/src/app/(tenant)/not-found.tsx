import type { Metadata } from "next";
import TenantUnavailable from "@/components/tenant/TenantUnavailable";

export const metadata: Metadata = { title: { absolute: "Workspace not available" }, robots: { index: false, follow: false } };

/** UNKNOWN host (and a platform host asking for `/_t/*`) end here: a real HTTP 404 with the generic page. */
export default function TenantNotFound() {
  return <TenantUnavailable />;
}

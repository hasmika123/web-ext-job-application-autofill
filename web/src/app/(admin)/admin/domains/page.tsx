import type { Metadata } from "next";
import AdminDomainsPage from "@/components/admin-v3/domains/AdminDomainsPage";

export const metadata: Metadata = {
  title: "Domains · Admin",
  robots: { index: false, follow: false },
};

/** The platform admin Domains list (CUSTOM-DOMAINS-BUILD.md A4b): every organization's addresses; the table reads its own pages through the BFF. */
export default function AdminDomainsRoute() {
  return <AdminDomainsPage />;
}

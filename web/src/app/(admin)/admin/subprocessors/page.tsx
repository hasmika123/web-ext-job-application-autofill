import type { Metadata } from "next";
import { serverApiFetch } from "@/lib/api";
import SubprocessorsAdmin from "@/components/admin-v3/privacy/SubprocessorsAdmin";
import { normalizeAdminSubprocessors } from "@/lib/subprocessors-admin";

export const metadata: Metadata = {
  title: "Subprocessors · Admin",
  robots: { index: false, follow: false },
};

// Server half: reads the twelve register slots; the client component edits them with autosave through /api/admin/subprocessors.
export default async function AdminSubprocessorsPage() {
  let items = null;
  try {
    const res = await serverApiFetch("/api/admin/privacy/subprocessors");
    if (res.ok) items = normalizeAdminSubprocessors(await res.json().catch(() => null));
  } catch {
    items = null;
  }
  return <SubprocessorsAdmin initial={items} />;
}

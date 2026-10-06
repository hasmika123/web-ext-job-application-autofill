import type { Metadata } from "next";
import Link from "next/link";
import { serverApiFetch } from "@/lib/api";
import { getPlan } from "@/lib/billing";
import InboxConnect, { type InboxView } from "@/components/settings/InboxConnect";

export const metadata: Metadata = { title: "Inbox · Settings · Kiwiply" };

/**
 * Connect a dedicated Gmail (Phase 14.1, Pro) so replies from employers update the board by
 * themselves. The page walks the user through the three things Google needs (a Gmail just for
 * job hunting, 2-Step Verification, an app password), then checks the pair against Gmail before
 * keeping it.
 */
export default async function InboxSettingsPage() {
  const plan = await getPlan();
  const isPro = plan.plan === "PRO";
  let view: InboxView | null = null;
  const res = await serverApiFetch("/api/profile/inbox");
  if (res.ok) view = (await res.json().catch(() => null)) as InboxView | null;
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <header>
        <Link href="/settings" className="text-[13px] font-medium text-muted hover:text-ink">
          ← Settings
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-ink">Inbox</h1>
        <p className="mt-1 text-sm text-muted">
          Connect the Gmail you apply from, and your board updates itself when employers write back.
        </p>
      </header>
      <InboxConnect isPro={isPro} view={view} />
    </div>
  );
}

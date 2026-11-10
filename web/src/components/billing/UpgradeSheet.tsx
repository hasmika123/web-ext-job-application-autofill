"use client";

import Link from "next/link";
import { buttonVariants, Button } from "@kiwiply/ui";
import ResponsiveSheet from "./ResponsiveSheet";
import { upgradeLine, type UpgradeHint } from "@/lib/subscription/upgrade";

/**
 * The one upgrade prompt (K7.6, 06-entitlements section 5): renders the `upgrade` object the server put on a 402 body, so every lock says which plan
 * unlocks the feature and links straight to it. The web never picks a plan or a price itself.
 */
export default function UpgradeSheet({ upgrade, subject, open, onClose }: { upgrade: UpgradeHint | null; subject?: string; open: boolean; onClose: () => void }) {
  if (!upgrade) return null;
  return (
    <ResponsiveSheet
      open={open}
      onClose={onClose}
      id="upgrade-sheet"
      title={upgradeLine(upgrade, subject)}
      description="Cancel anytime. No refunds for partial periods; you keep access to the end of what you paid for."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Not now
          </Button>
          <Link href={upgrade.path} className={buttonVariants("accent", "md")}>
            See {upgrade.planName ?? upgrade.planKey}
          </Link>
        </>
      }
    >
      <p className="text-[13px] text-ink-soft">The price shown is the plan&apos;s current price for your billing interval.</p>
    </ResponsiveSheet>
  );
}

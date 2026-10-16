"use client";

import Link from "next/link";
import { buttonVariants, Button, Dialog, LayersIcon } from "@kiwiply/ui";
import { useBuilderEnv } from "../builderEnv";
import type { CapNotice } from "../new-resume/model";

/**
 * The "you're at your resume limit" prompt (DESIGN 10.14): shown by every way to make a resume (New Resume, the empty
 * state, Duplicate, Copy, Upload) and by a 402 from the server, so it is right even when the page's count is stale.
 * `max` is the plan's cap as the server reported it (builder config); nothing here knows 3 / 25 / 50.
 */
export default function CapDialog({ notice, max, onManage, onClose }: { notice: CapNotice | null; max: number; onManage: () => void; onClose: () => void }) {
  const upgradeHref = useBuilderEnv().upgradeHref;
  const organization = notice?.plan === "ORGANIZATION";
  // an organization license is not for sale to the person: no plans link, the organization admin is who to ask
  const canUpgrade = !organization && notice?.plan !== "AUTOPILOT" && upgradeHref !== null;
  const shown = notice?.limit ?? max;
  return (
    <Dialog
      open={notice !== null}
      onClose={onClose}
      title={`You've used ${shown} of ${shown} resumes`}
      description={
        organization
          ? notice?.message
          : notice?.plan === "FREE"
            ? "Your free plan is full. Upgrade for more room, or archive one you don't need and keep going."
            : "This plan is full. Archive or delete one you're done with to make room, or see what a bigger plan includes."
      }
      footer={
        <>
          <Button variant="ghost" onClick={onManage}>
            Manage resumes
          </Button>
          {canUpgrade && (
            <Link href={notice?.upgrade?.path ?? upgradeHref ?? "/pricing"} className={buttonVariants("accent", "md")}>
              {notice?.upgrade ? `See ${notice.upgrade.planName ?? notice.upgrade.planKey}` : notice?.plan === "FREE" ? "See plans" : "Upgrade"}
            </Link>
          )}
        </>
      }
    >
      <p className="flex items-center gap-2 text-[13px] text-ink-soft">
        <LayersIcon size={16} aria-hidden /> Nothing was deleted. Your resumes are all still here.
      </p>
    </Dialog>
  );
}

import Link from "next/link";
import { ArrowRightIcon, Meter, buttonVariants, cn } from "@kiwiply/ui";
import type { Completeness } from "@/lib/profile-items";
import { tabFromHref } from "../tabs";

/** The profile tab a next action points at, as a link of our own (an unknown tab opens the Overview). */
export function profileHref(href: string | null | undefined): string {
  const tab = tabFromHref(href);
  return tab === "overview" ? "/profiles" : `/profiles?tab=${tab}`;
}

/**
 * The dashboard's "Profile 62% - next: ..." card (Resume Builder R1.6): once the profile is past the setup
 * prompt (`BuildProfileCard` takes the lower range) and something is still missing, it names the single
 * highest-weight next step and links to the profile tab where it is done. Nothing at 100 %. A plain
 * server-renderable card; the suggestions card below it is unchanged.
 */
/** `promptBelow` is the admin setting `profile.setup.promptBelowPercent` (`config.profile.setupPromptBelowPercent`): under it the setup card owns the slot. */
export default function ProfileProgressCard({ completeness, promptBelow }: { completeness: Completeness | null; promptBelow: number }) {
  if (!completeness || completeness.score < promptBelow || !completeness.nextAction) return null;
  const { score, nextAction } = completeness;
  return (
    <section aria-label="Profile progress" className="flex flex-col gap-3 rounded-2xl border border-v2-line/70 bg-paper p-4 shadow-v2-soft sm:flex-row sm:items-center sm:gap-5 sm:p-5">
      <div className="min-w-0 flex-1">
        <h2 className="text-[15px] font-extrabold text-v2-navy">
          Profile {score}% <span className="font-semibold text-v2-ink-soft">— next: {nextAction.label}</span>
        </h2>
        <Meter value={score} label="Profile strength" valueText={`${score} percent`} neutral className="mt-2.5 max-w-xs" />
      </div>
      <Link href={profileHref(nextAction.href)} className={cn(buttonVariants("ghost"), "flex-none max-sm:min-h-11")}>
        Continue <ArrowRightIcon size={15} aria-hidden />
      </Link>
    </section>
  );
}

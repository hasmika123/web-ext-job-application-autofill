import Link from "next/link";
import { ArrowRightIcon, Meter, SparklesIcon, buttonVariants, cn } from "@kiwiply/ui";

/**
 * The dashboard's "Build your profile" card: shown while the profile is under `promptBelow` percent
 * complete (the admin setting `profile.setup.promptBelowPercent`, `config.profile.setupPromptBelowPercent`),
 * with the meter and a link into `/profiles/setup`. A plain server-renderable card.
 */
export default function BuildProfileCard({ score, promptBelow }: { score: number; promptBelow: number }) {
  if (score >= promptBelow) return null;
  return (
    <section aria-label="Build your profile" className="flex flex-col gap-3 rounded-2xl border border-v2-line/70 bg-v2-lime-soft/60 p-4 shadow-v2-soft sm:flex-row sm:items-center sm:gap-5 sm:p-5">
      <span className="grid h-11 w-11 flex-none place-items-center rounded-xl bg-paper text-v2-green">
        <SparklesIcon size={22} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="text-[15px] font-extrabold text-v2-navy">Build your profile</h2>
        <p className="mt-0.5 text-[13.5px] text-v2-ink-soft">
          Your profile is {score}% complete. Upload or paste your resume and confirm a few cards, no long forms.
        </p>
        <Meter value={score} label="Profile strength" valueText={`${score} percent`} neutral className="mt-2.5 max-w-xs" />
      </div>
      <Link href="/profiles/setup" className={cn(buttonVariants("accent"), "flex-none max-sm:min-h-11")}>
        Start <ArrowRightIcon size={15} aria-hidden />
      </Link>
    </section>
  );
}

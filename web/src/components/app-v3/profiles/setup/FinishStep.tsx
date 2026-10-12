"use client";

import Link from "next/link";
import { ArrowRightIcon, ConfettiBurst, Meter, buttonVariants, cn } from "@kiwiply/ui";
import type { Completeness } from "@/lib/profile-items";
import SensitiveNotice from "./SensitiveNotice";

export interface FinishResult {
  /** What was added: created + merged entries. */
  added: number;
  removed: number;
  completeness: Completeness | null;
}

/**
 * The last screen: the profile strength meter, the one next action the API names, and one confetti
 * burst (none under reduced motion). Mounted only after the profile was saved.
 */
export default function FinishStep({ result }: { result: FinishResult }) {
  const score = result.completeness?.score ?? null;
  const next = result.completeness?.nextAction ?? null;
  return (
    <div className="relative overflow-x-clip text-center sm:text-left">
      <ConfettiBurst />
      <h2 className="font-display text-[24px] font-extrabold text-v2-navy">Your profile is set up.</h2>
      <p className="mt-1 text-[14px] text-v2-ink-soft">
        {result.added > 0 ? `${result.added} ${result.added === 1 ? "entry" : "entries"} added.` : "Your answers are saved."} Resumes you build will start from
        this.
      </p>

      {score !== null && (
        <div className="mt-5 max-w-md">
          <div className="mb-1.5 flex items-baseline justify-between">
            <span className="text-[13px] font-semibold text-v2-ink-soft">Profile strength</span>
            <span className="font-display text-[20px] font-extrabold text-v2-navy">{score}%</span>
          </div>
          <Meter value={score} label="Profile strength" valueText={`${score} percent`} neutral className="h-2.5" />
        </div>
      )}

      <div className="mt-5">
        <SensitiveNotice removed={result.removed} />
      </div>

      {next && (
        <div className="mt-6 rounded-2xl border border-v2-line/70 bg-paper-2/50 p-4 text-left">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-v2-muted">Next</p>
          <p className="mt-0.5 text-[15px] font-bold text-v2-navy">{next.label}</p>
          <Link href={next.href} className={cn(buttonVariants("accent"), "mt-3 max-sm:min-h-11")}>
            Do it now <ArrowRightIcon size={15} aria-hidden />
          </Link>
        </div>
      )}

      <div className="mt-6 flex flex-wrap justify-center gap-3 sm:justify-start">
        <Link href="/profiles" className={cn(buttonVariants(next ? "ghost" : "accent"), "max-sm:min-h-11")}>
          View my profile
        </Link>
        <Link href="/resume-builder" className={cn(buttonVariants("ghost"), "max-sm:min-h-11")}>
          Build a resume
        </Link>
      </div>
    </div>
  );
}

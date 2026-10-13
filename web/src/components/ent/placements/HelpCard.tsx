"use client";

import { ChevronRightIcon, SparklesIcon } from "@kiwiply/ui";
import { EnterpriseMascot } from "@/lib/ent/mascot";
import { ClaimsHelpCard, ClaimsMascot, openHelpPanel } from "@/components/ent/shell/ShellContext";

/**
 * The board's help card: a banner with the bee over a soft wash, the question, one line of what it can help with, and "Ask a question...".
 * It carries the page's ONE enterprise bee (the sidebar card steps aside while it is on screen) and opens the shell's shared help panel, which
 * lists where a person can be reached (there is no question assistant yet).
 */
export default function HelpCard() {
  return (
    <section aria-label="Help with placements" data-help-card className="ent-card overflow-hidden">
      <ClaimsMascot />
      <ClaimsHelpCard />
      <div aria-hidden className="relative flex h-[84px] items-end overflow-hidden bg-[linear-gradient(100deg,var(--ent-kpi-orange-bg),var(--ent-field-bg)_48%,var(--ent-kpi-green-bg))] px-3">
        <span className="absolute -right-4 -top-6 h-24 w-24 rounded-full bg-white/50" />
        <span className="absolute right-10 bottom-0 h-10 w-16 rounded-t-xl bg-[color:var(--pl-sky)]/70" />
        <span className="absolute left-1/2 top-3 h-3 w-3 rounded-full bg-[color:var(--pl-sun)]/80" />
        <EnterpriseMascot pose="greet" size="md" className="relative -mb-1" />
      </div>
      <div className="px-3.5 pb-3 pt-2.5">
        <h2 className="text-[14.5px] font-bold leading-tight text-[color:var(--ent-title)]">Need help with placements?</h2>
        <p className="mt-1 text-[12px] leading-[1.35] text-[color:var(--pl-soft)]">I can help you track placements, check upcoming end dates, or find consultants ready for redeployment.</p>
        <button
          type="button"
          onClick={() => openHelpPanel()}
          className="mt-2.5 flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-[color:var(--pl-blue-line)] bg-[color:var(--ent-field-bg)] px-3 text-[12.5px] font-semibold text-accent-deep hover:bg-accent-soft/60"
        >
          <span className="inline-flex items-center gap-2">
            <SparklesIcon size={16} aria-hidden /> Ask a question...
          </span>
          <ChevronRightIcon size={16} aria-hidden />
        </button>
      </div>
    </section>
  );
}

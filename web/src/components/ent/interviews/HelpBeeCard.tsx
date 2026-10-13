"use client";

import { useState } from "react";
import { ChevronRightIcon, Dialog, ExternalLinkIcon, SparklesIcon } from "@kiwiply/ui";
import { EnterpriseMascot } from "@/lib/ent/mascot";
import { helpLinks } from "@/lib/ent/shell";
import { ClaimsMascot } from "@/components/ent/shell/ShellContext";

/**
 * The card top-right of the board: the page's ONE enterprise bee (it tells the shell to drop the sidebar card's bee while it is on screen)
 * over a soft banner, a title, one line of help and "Ask a question...". The question opens the same help panel the shell offers (no
 * assistant is switched on yet, so it lists where a person can be reached).
 */
export default function HelpBeeCard({ orgName, supportEmail }: { orgName: string; supportEmail?: string | null }) {
  const [open, setOpen] = useState(false);
  const links = helpLinks(supportEmail);
  return (
    <section aria-label="Interview coordination help" data-help-bee className="ent-card shrink-0 overflow-hidden !p-0">
      <ClaimsMascot />
      <div className="flex h-[92px] items-end justify-center bg-gradient-to-b from-accent-soft/70 to-accent-soft/20 pt-1.5">
        <EnterpriseMascot pose="greet" size="md" />
      </div>
      <div className="px-3.5 pb-3.5 pt-2.5">
        <h2 className="text-[13.5px] font-bold leading-tight text-ink">Need help with interview coordination?</h2>
        <p className="mt-1 text-[12px] leading-snug text-ink-soft">I can help you schedule interviews, prepare candidates, or find the best interview process for your team at {orgName}.</p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-2.5 flex min-h-9 w-full items-center gap-2 rounded-lg border border-accent/30 bg-paper px-3 text-[13px] font-medium text-accent-deep hover:bg-accent-soft"
        >
          <SparklesIcon size={16} aria-hidden /> <span className="flex-1 text-left">Ask a question...</span> <ChevronRightIcon size={15} aria-hidden />
        </button>
      </div>
      <Dialog open={open} onClose={() => setOpen(false)} title="Need help?" description={`Questions about ${orgName}? Here is where to go.`}>
        <p className="text-[13.5px] leading-relaxed text-muted">The question assistant isn&apos;t switched on yet, so there is nothing to type into here. Until it is, these reach a person.</p>
        <ul className="mt-4 flex flex-col gap-2">
          {links.map((l) => (
            <li key={l.href}>
              <a
                href={l.href}
                {...(l.external && l.href.startsWith("http") ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-line px-4 py-2.5 text-[14px] font-semibold text-ink hover:bg-paper-2"
              >
                <span className="truncate">{l.label}</span>
                <ExternalLinkIcon size={16} className="flex-none text-muted" />
              </a>
            </li>
          ))}
        </ul>
      </Dialog>
    </section>
  );
}

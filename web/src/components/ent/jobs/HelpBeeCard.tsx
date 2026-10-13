"use client";

import { useState } from "react";
import { Dialog, ExternalLinkIcon, SparklesIcon } from "@kiwiply/ui";
import { EnterpriseMascot } from "@/lib/ent/mascot";
import { helpLinks } from "@/lib/ent/shell";
import { ClaimsMascot } from "@/components/ent/shell/ShellContext";

/**
 * "Need help finding the right consultants for this job?" with the enterprise bee: the page's one mascot, so it tells the shell
 * (ClaimsMascot) to drop the sidebar card's bee while it is on screen. "Ask a question..." opens the same help list the shell offers (no
 * assistant is switched on yet, so it lists where a person can be reached).
 */
export default function HelpBeeCard({ orgName, supportEmail, forJob = false }: { orgName: string; supportEmail?: string | null; forJob?: boolean }) {
  const [open, setOpen] = useState(false);
  const links = helpLinks(supportEmail);
  return (
    <section aria-label="Help" data-help-bee className="flex items-center gap-3 overflow-hidden rounded-2xl border border-line bg-accent-soft/50 p-3">
      <ClaimsMascot />
      <EnterpriseMascot pose="greet" size="md" />
      <div className="min-w-0 flex-1">
        <h2 className="text-[14.5px] font-bold leading-tight text-ink">{forJob ? "Need help finding the right consultants for this job?" : "Need help with your jobs?"}</h2>
        <p className="mt-0.5 text-[12.5px] leading-snug text-muted">
          {forJob ? "I can help you find top matches, review submissions, or suggest skills to improve your reach." : `Questions about jobs, matches or submissions at ${orgName}? We can point you the right way.`}
        </p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-2 inline-flex min-h-10 items-center gap-2 rounded-xl border border-line bg-paper px-3 text-[13px] font-semibold text-accent-deep hover:bg-accent-soft"
        >
          <SparklesIcon size={16} aria-hidden /> Ask a question...
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

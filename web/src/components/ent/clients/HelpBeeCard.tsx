"use client";

import { useState } from "react";
import { ChevronRightIcon, Dialog, ExternalLinkIcon, SparklesIcon } from "@kiwiply/ui";
import { EnterpriseMascot } from "@/lib/ent/mascot";
import { helpLinks } from "@/lib/ent/shell";
import { ClaimsMascot } from "@/components/ent/shell/ShellContext";

/**
 * "Need help with client management?": the board's card, a soft banner with the enterprise bee over the title, the sentence and one
 * "Ask a question..." row. It is the page's one mascot, so it tells the shell (ClaimsMascot) to drop the sidebar card's bee while it is on
 * screen. The assistant is not switched on yet, so the row opens a panel that lists where a person can be reached.
 */
export default function HelpBeeCard({ orgName, supportEmail }: { orgName: string; supportEmail?: string | null }) {
  const [open, setOpen] = useState(false);
  const links = helpLinks(supportEmail);
  return (
    <section aria-label="Help" data-help-bee className="ent-card flex h-full flex-col overflow-hidden !rounded-[14px] p-[3px]">
      <ClaimsMascot />
      <div aria-hidden className="relative grid h-[84px] flex-none place-items-end overflow-hidden rounded-[12px] bg-[linear-gradient(120deg,var(--ent-kpi-orange-bg),var(--ent-kpi-blue-bg)_55%,var(--ent-kpi-green-bg))]">
        <EnterpriseMascot pose="greet" size="md" className="translate-y-1" />
      </div>
      <div className="flex min-h-0 flex-1 flex-col px-3 pb-2.5 pt-2.5">
        <h2 className="text-[14.5px] font-bold leading-tight text-[var(--ent-title)]">Need help with client management?</h2>
        <p className="mt-1.5 text-[12px] leading-[1.35] text-ink-soft">I can help you manage client companies, contacts, requirements, and track your client relationships.</p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-auto flex min-h-9 w-full items-center gap-2 rounded-[10px] border border-[var(--ent-control-border)] bg-[var(--ent-field-bg)] px-3 text-[13px] font-medium text-accent-deep hover:bg-accent-soft"
        >
          <SparklesIcon size={16} aria-hidden /> <span className="flex-1 text-left">Ask a question...</span> <ChevronRightIcon size={15} aria-hidden />
        </button>
      </div>
      <Dialog open={open} onClose={() => setOpen(false)} title="Need help?" description={`Questions about clients at ${orgName}? Here is where to go.`}>
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

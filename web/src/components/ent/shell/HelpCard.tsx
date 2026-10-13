"use client";

import { useRef, useState } from "react";
import { Dialog, ExternalLinkIcon, HelpCircleIcon, IconButton, SparklesIcon, Tooltip } from "@kiwiply/ui";
import { EnterpriseMascot } from "@/lib/ent/mascot";
import { helpLinks } from "@/lib/ent/shell";

/**
 * "Need help?" (16 s2.1): the enterprise bee, a one-line offer and "Ask a question...". There is no assistant behind it yet, so the
 * button opens a small help panel that says so and offers the organization's support email and the Kiwiply help centre.
 * `bee=false` (the page already shows a bee, or the rail is collapsed) keeps the card text-only.
 */
export default function HelpCard({ firstName, orgName, supportEmail, bee = true, collapsed = false }: { firstName: string; orgName: string; supportEmail?: string | null; bee?: boolean; collapsed?: boolean }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const links = helpLinks(supportEmail);

  const panel = (
    <Dialog open={open} onClose={() => setOpen(false)} title="Need help?" description={`Questions about ${orgName}? Here is where to go.`}>
      <p className="text-[13.5px] leading-relaxed text-muted">
        The question assistant isn&apos;t switched on yet, so there is nothing to type into here. Until it is, these reach a person.
      </p>
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
  );

  if (collapsed)
    return (
      <div className="flex justify-center pb-3">
        <Tooltip content="Need help?" side="right">
          <IconButton aria-label="Need help? Ask a question" onClick={() => setOpen(true)} className="h-10 w-10 text-accent">
            <HelpCircleIcon size={20} />
          </IconButton>
        </Tooltip>
        {panel}
      </div>
    );

  return (
    <section aria-label="Help" data-help-card className="mx-3 mb-3 overflow-hidden rounded-2xl border border-line bg-accent-soft/50">
      {bee ? (
        <div className="flex justify-center bg-accent-soft pt-3 [@media(max-height:820px)]:hidden">
          <EnterpriseMascot pose="greet" size="md" />
        </div>
      ) : null}
      <div className="p-3.5">
        <h2 className="text-[16px] font-bold leading-tight text-ink">Need help, {firstName}?</h2>
        <p className="mt-1 text-[12.5px] leading-snug text-muted">Find a page, reach support, or ask about {orgName}.</p>
        <button
          ref={trigger}
          type="button"
          onClick={() => setOpen(true)}
          className="mt-3 flex min-h-10 w-full items-center gap-2 rounded-xl border border-[var(--brand-border,var(--color-line))] bg-paper px-2.5 text-left text-[13px] font-semibold text-accent-deep hover:bg-accent-soft"
        >
          <SparklesIcon size={16} className="flex-none" />
          <span className="min-w-0 flex-1 truncate">Ask a question...</span>
        </button>
      </div>
      {panel}
    </section>
  );
}

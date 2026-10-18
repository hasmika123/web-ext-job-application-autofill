"use client";

import { useState } from "react";
import { Dialog, ExternalLinkIcon, SparklesIcon } from "@kiwiply/ui";
import HelpBanner from "@/components/ent/shared/HelpBanner";
import { helpLinks } from "@/lib/ent/shell";

/**
 * "Need help managing consultants?" with the enterprise bee. It is the page's one mascot, so it tells the shell (ClaimsMascot) to drop the
 * sidebar card's bee while it is on screen. "Ask a question..." opens a panel that lists where a person can be reached (no assistant yet).
 */
export default function HelpBeeCard({ orgName, supportEmail }: { orgName: string; supportEmail?: string | null; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const links = helpLinks(supportEmail);
  return (
    <div data-help-bee>
      <HelpBanner topic="consultants" title="Need help managing consultants?" text={`I can help you find consultants, manage licenses, or answer questions about consultant assignments at ${orgName}.`} layout="drawer" onAsk={() => setOpen(true)} dismissible={false} />
      <Dialog open={open} onClose={() => setOpen(false)} title="Need help?" description={`Questions about consultants at ${orgName}? Here is where to go.`}>
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
    </div>
  );
}

"use client";

import { useState } from "react";
import { ChevronRightIcon, Dialog, ExternalLinkIcon, SparklesIcon } from "@kiwiply/ui";
import { ENT_MASCOT_BASE } from "@/lib/ent/mascot";
import { helpLinks } from "@/lib/ent/shell";
import { ClaimsMascot } from "@/components/ent/shell/ShellContext";

/**
 * The bee help card of the talent boards: a scenic banner (window, plant, desk; drawn in CSS) with the laptop bee on it, a bold title, two
 * lines of text and the "Ask a question..." bar. `stack` is the tall card at the top right of a page (banner above the text); `row` is the
 * wide card at the foot of a drawer (banner on the left). It is the page's one mascot, so it tells the shell to drop the sidebar bee.
 * "Ask a question..." opens the list of people to reach (there is no assistant yet).
 */
export default function BeeBanner({
  title,
  body,
  topic,
  orgName,
  supportEmail,
  layout = "stack",
  className = "",
}: {
  title: string;
  body: string;
  /** "resumes", "jobs": used in the help dialog's sentence. */
  topic: string;
  orgName: string;
  supportEmail?: string | null;
  layout?: "stack" | "row";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const links = helpLinks(supportEmail);
  const row = layout === "row";
  return (
    <section
      aria-label="Help"
      data-help-bee
      className={`ent-card flex min-w-0 overflow-hidden ${row ? "flex-row items-stretch gap-3 !bg-[var(--ent-x-fff8ec)] p-2.5" : "flex-col"} ${className}`}
    >
      <ClaimsMascot />
      <div className={`ent-scene flex-none ${row ? "w-[34%] min-h-[92px] rounded-xl" : "h-[84px]"}`} aria-hidden>
        {/* the art is a decoration; the card's title already says what it is */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`${ENT_MASCOT_BASE}/working.png`} alt="" draggable={false} />
      </div>
      <div className={`flex min-w-0 flex-1 flex-col ${row ? "justify-center py-1 pr-1" : "px-3.5 pb-3 pt-2"}`}>
        <h2 className="text-[13px] font-extrabold leading-tight text-[var(--ent-title)]">{title}</h2>
        <p className="mt-1 text-[11px] leading-[1.35] text-[var(--ent-soft)]">{body}</p>
        <button type="button" onClick={() => setOpen(true)} className="ent-ask mt-2.5" data-help-ask>
          <SparklesIcon size={16} aria-hidden /> <span className="flex-1">Ask a question...</span> <ChevronRightIcon size={16} aria-hidden />
        </button>
      </div>
      <Dialog open={open} onClose={() => setOpen(false)} title="Need help?" description={`Questions about ${topic} at ${orgName}? Here is where to go.`}>
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

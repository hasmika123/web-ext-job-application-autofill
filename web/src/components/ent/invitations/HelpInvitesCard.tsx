"use client";

import { useState } from "react";
import { ChevronRightIcon, SparklesIcon } from "@kiwiply/ui";
import { HelpPanel } from "@/components/ent/shell/HelpCard";
import { ENT_MASCOT_BASE } from "@/lib/ent/mascot";

/** "Need help with invitations?": the bee, one line of what it can help with, and "Ask a question..." (opens the shell's help panel). */
export default function HelpInvitesCard({ orgName, supportEmail, bee }: { orgName: string; supportEmail?: string | null; bee: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <section aria-labelledby="inv-help-h" data-invitation-help className="inv-card flex min-w-0 items-center gap-4 overflow-hidden p-4 sm:p-5">
      {bee && (
        <div aria-hidden className="hidden h-[190px] w-[200px] flex-none items-end justify-center overflow-hidden rounded-2xl bg-gradient-to-b from-accent-soft to-paper sm:flex xl:w-[250px]">
          {/* eslint-disable-next-line @next/next/no-img-element -- a fixed static bee plate */}
          <img src={`${ENT_MASCOT_BASE}/typing.png`} alt="" width={182} height={199} className="h-[176px] w-auto" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <h2 id="inv-help-h" className="text-[19px] font-bold leading-tight text-ink">
          Need help with invitations?
        </h2>
        <p className="mt-2 text-[14.5px] leading-snug text-ink-soft">I can help you invite team members, resend invitations, manage permissions, or answer any questions about user access.</p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-4 flex min-h-11 w-full items-center gap-2.5 rounded-xl border border-accent/25 bg-accent-soft/60 px-3.5 text-left text-[15px] font-semibold text-accent-deep hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:min-h-11"
        >
          <SparklesIcon aria-hidden size={20} className="flex-none text-accent" />
          <span className="min-w-0 flex-1 truncate">Ask a question...</span>
          <ChevronRightIcon aria-hidden size={18} className="flex-none text-accent" />
        </button>
      </div>
      <HelpPanel open={open} onClose={() => setOpen(false)} orgName={orgName} supportEmail={supportEmail} />
    </section>
  );
}

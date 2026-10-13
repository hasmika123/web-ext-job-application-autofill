"use client";

import { useState } from "react";
import { SparklesIcon } from "@kiwiply/ui";
import { HelpPanel } from "@/components/ent/shell/HelpCard";
import { EnterpriseMascot } from "@/lib/ent/mascot";

/** "Need help with invitations?": the bee, one line of what it can help with, and "Ask a question..." (opens the shell's help panel). */
export default function HelpInvitesCard({ orgName, supportEmail, bee }: { orgName: string; supportEmail?: string | null; bee: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <section aria-labelledby="inv-help-h" data-invitation-help className="flex min-w-0 items-center gap-4 overflow-hidden rounded-[var(--radius-lg)] border border-line bg-paper p-4 sm:p-5">
      {bee && (
        <div className="hidden flex-none rounded-2xl bg-accent-soft px-3 pt-3 sm:block">
          <EnterpriseMascot pose="greet" size="lg" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <h2 id="inv-help-h" className="text-[17px] font-bold text-ink">
          Need help with invitations?
        </h2>
        <p className="mt-1 text-[13px] leading-snug text-muted">I can help you invite team members, resend invitations, manage permissions, or answer any questions about user access.</p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-3 flex min-h-11 w-full items-center gap-2 rounded-xl border border-line bg-accent-soft/50 px-3 text-left text-[14px] font-semibold text-accent-deep hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:min-h-10"
        >
          <SparklesIcon aria-hidden size={16} className="flex-none" />
          <span className="min-w-0 flex-1 truncate">Ask a question...</span>
        </button>
      </div>
      <HelpPanel open={open} onClose={() => setOpen(false)} orgName={orgName} supportEmail={supportEmail} />
    </section>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Dialog, ExternalLinkIcon } from "@kiwiply/ui";
import { helpLinks } from "@/lib/ent/shell";
import { OPEN_HELP_EVENT } from "./ShellContext";

/** "Help & support": the people and pages a member can reach (there is no question assistant, so the panel offers none). */
export function HelpPanel({ open, onClose, orgName, supportEmail }: { open: boolean; onClose: () => void; orgName: string; supportEmail?: string | null }) {
  const links = helpLinks(supportEmail);
  return (
    <Dialog open={open} onClose={onClose} title="Help & support" description={`Questions about ${orgName}? These reach a person.`}>
      <ul className="flex flex-col gap-2">
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
}

/** The shell's one help panel, opened from the account menu's "Help & support" and the footer's "Support" (`openHelpPanel()`). */
export default function HelpPanelHost({ orgName, supportEmail }: { orgName: string; supportEmail?: string | null }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const on = () => setOpen(true);
    window.addEventListener(OPEN_HELP_EVENT, on);
    return () => window.removeEventListener(OPEN_HELP_EVENT, on);
  }, []);
  return <HelpPanel open={open} onClose={() => setOpen(false)} orgName={orgName} supportEmail={supportEmail} />;
}

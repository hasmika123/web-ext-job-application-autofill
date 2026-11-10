"use client";

import Link from "next/link";
import { openHelpPanel } from "./ShellContext";

/**
 * The foot of every workspace page: the organization's name and the pages every member can reach on its own host. No Kiwiply
 * links: a member of an enterprise account never lands on a Kiwiply page (docs/enterprise-v2/62).
 */
export default function ShellFooter({ orgName, supportEmail }: { orgName: string; supportEmail?: string | null }) {
  return (
    <footer data-shell-footer className="ent-footer">
      <p>
        &copy; {new Date().getFullYear()} {orgName}
      </p>
      <nav aria-label="Footer" className="flex flex-wrap items-center gap-x-5 gap-y-1">
        <Link href="/privacy">Privacy policy</Link>
        <Link href="/terms">Terms of use</Link>
        <Link
          href="/support"
          onClick={(e) => {
            // the help panel lists the same people and pages; the link still works without script
            e.preventDefault();
            openHelpPanel();
          }}
        >
          Support
        </Link>
        {supportEmail ? <a href={`mailto:${supportEmail}`}>{supportEmail}</a> : null}
      </nav>
    </footer>
  );
}

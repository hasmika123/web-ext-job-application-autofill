"use client";

import Link from "next/link";
import { BugIcon, Button, MailIcon } from "@kiwiply/ui";
import { SettingsCard } from "./panels";

/** The event the global bug-report widget listens for (see `BugReportWidget`). */
export const OPEN_BUG_REPORT_EVENT = "kiwiply:open-bug-report";

/** The shortcuts that really exist in the app today (the Resume Builder's), by group. */
export const KEYBOARD_SHORTCUTS: readonly { group: string; items: readonly { keys: string; what: string }[] }[] = [
  {
    group: "Resume Builder",
    items: [
      { keys: "Ctrl/⌘ + Z", what: "Undo" },
      { keys: "Ctrl/⌘ + Shift + Z", what: "Redo" },
      { keys: "Ctrl/⌘ + S", what: "Save a version now" },
      { keys: "Alt + 1 to 4", what: "Open or close the side panels" },
      { keys: "Alt + D", what: "Open the Download menu" },
      { keys: "Alt + P", what: "Print layout view" },
      { keys: "Alt + V", what: "PDF view" },
      { keys: "Alt + S", what: "Resume settings" },
    ],
  },
  {
    group: "Everywhere",
    items: [{ keys: "Esc", what: "Close a menu, sheet or dialog" }],
  },
];

const SUPPORT_EMAIL = "support@kiwiply.com";

/**
 * Settings > Help & Support (E2E-U14.0): report a problem (opens the same bug-report dialog as the floating bug button,
 * so there is one report flow), contact us, the keyboard shortcuts, and the policies.
 */
export default function HelpPanel() {
  return (
    <>
      <SettingsCard title="Help & support">
        <p className="text-[13.5px] text-ink-soft">Stuck, or found something off? We read every message.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" variant="primary" onClick={() => window.dispatchEvent(new Event(OPEN_BUG_REPORT_EVENT))}>
            <BugIcon aria-hidden className="h-4 w-4" />
            Report a problem
          </Button>
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-v2-line px-4 py-2 text-sm font-medium text-v2-navy hover:bg-paper-2 sm:min-h-0"
          >
            <MailIcon aria-hidden className="h-4 w-4" />
            Email us
          </a>
        </div>
        <p className="mt-3 text-[13px] text-v2-muted">We usually reply within two business days.</p>
        <ul className="mt-3 flex flex-col gap-2 text-[13.5px]">
          <li>
            <Link href="/contact" className="font-semibold text-v2-blue hover:underline">
              More ways to reach us →
            </Link>
          </li>
          <li>
            <Link href="/privacy" className="font-semibold text-v2-blue hover:underline">
              Privacy Policy →
            </Link>
          </li>
          <li>
            <Link href="/terms" className="font-semibold text-v2-blue hover:underline">
              Terms of Service →
            </Link>
          </li>
        </ul>
      </SettingsCard>

      <SettingsCard title="Keyboard shortcuts">
        {KEYBOARD_SHORTCUTS.map((g) => (
          <div key={g.group} className="mt-1 first:mt-0">
            <h3 className="mb-1 mt-3 text-[12px] font-bold uppercase tracking-wide text-v2-muted first:mt-0">{g.group}</h3>
            <dl className="divide-y divide-v2-line/60">
              {g.items.map((s) => (
                <div key={s.keys} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2">
                  <dt className="text-[13.5px] text-ink-soft">{s.what}</dt>
                  <dd>
                    <kbd className="rounded-md border border-v2-line bg-paper-2 px-2 py-0.5 font-mono text-xs text-v2-navy">{s.keys}</kbd>
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </SettingsCard>
    </>
  );
}

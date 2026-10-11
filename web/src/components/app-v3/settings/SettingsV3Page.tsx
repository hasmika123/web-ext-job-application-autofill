"use client";

import { useEffect, useState, type ReactNode } from "react";
import { BellIcon, CreditCardIcon, HelpCircleIcon, LockIcon, SlidersIcon, UserIcon, cn } from "@kiwiply/ui";
import { HeroBand } from "@/components/app-v2/common";

export type SettingsTabKey = "account" | "notifications" | "privacy" | "job-preferences" | "billing" | "help";

const NAV: { id: SettingsTabKey; label: string; icon: ReactNode }[] = [
  { id: "account", label: "Account", icon: <UserIcon className="h-4 w-4" /> },
  { id: "notifications", label: "Notifications", icon: <BellIcon className="h-4 w-4" /> },
  { id: "privacy", label: "Privacy", icon: <LockIcon className="h-4 w-4" /> },
  { id: "job-preferences", label: "Job Preferences", icon: <SlidersIcon className="h-4 w-4" /> },
  { id: "billing", label: "Billing", icon: <CreditCardIcon className="h-4 w-4" /> },
  { id: "help", label: "Help & Support", icon: <HelpCircleIcon className="h-4 w-4" /> },
];

/**
 * Settings shell (APP-V3-SPEC section 2.13): hero + left sub-nav. The panels are built by the
 * server page (they need account, plan and inbox data and contain server components such as the
 * billing card) and handed over by tab id. The sub-nav stays beside the panel from 768px; only
 * phones stack it above as a scrolling pill row. `#billing` style hashes still deep-link a tab.
 */
export default function SettingsV3Page({ panels }: { panels: Record<SettingsTabKey, ReactNode> }) {
  const [tab, setTab] = useState<SettingsTabKey>("account");

  useEffect(() => {
    const fromHash = () => {
      const h = window.location.hash.replace("#", "");
      if (NAV.some((n) => n.id === h)) setTab(h as SettingsTabKey);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, []);

  const pick = (id: SettingsTabKey) => {
    setTab(id);
    window.history.replaceState(null, "", `#${id}`);
  };

  return (
    <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-4">
      <HeroBand title="Settings" subtitle="Manage your account and preferences." mascot="mascot-help" mascotHeight={110} />

      <div className="grid items-start gap-4 md:grid-cols-[210px_minmax(0,1fr)]">
        <nav
          aria-label="Settings sections"
          className="flex gap-1.5 overflow-x-auto rounded-2xl border border-v2-line/70 bg-paper p-2 shadow-v2-soft [scrollbar-width:none] md:sticky md:top-4 md:flex-col md:overflow-visible"
        >
          {NAV.map((n) => {
            const active = tab === n.id;
            return (
              <button
                key={n.id}
                type="button"
                onClick={() => pick(n.id)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-none items-center gap-2.5 whitespace-nowrap rounded-xl px-3 py-2.5 text-left text-[14px] font-semibold transition-colors",
                  active ? "bg-v2-blue-soft text-v2-blue" : "text-ink-soft hover:bg-paper-2",
                )}
              >
                {n.icon}
                {n.label}
              </button>
            );
          })}
        </nav>

        <div className="flex min-w-0 flex-col gap-4">{panels[tab]}</div>
      </div>
    </div>
  );
}

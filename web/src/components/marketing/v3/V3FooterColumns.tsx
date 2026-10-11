"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { ChevronDownIcon, cn } from "@kiwiply/ui";
import type { NavGroup } from "../nav";

/**
 * Footer link columns for landing v3. Phone board: four collapsible rows (For Individuals / For
 * Organizations / Resources / Company), one open at a time. From lg the rows become plain columns,
 * all open, with the toggle disabled. Items with no destination render as text with a "Soon" chip.
 */
export default function V3FooterColumns({ groups }: { groups: NavGroup[] }) {
  const uid = useId();
  const [open, setOpen] = useState<string | null>(null);

  return (
    <nav aria-label="Footer" className="divide-y divide-white/10 border-y border-white/10 md:grid md:grid-cols-2 md:gap-x-6 md:gap-y-6 md:divide-y-0 md:border-0 lg:grid-cols-4">
      {groups.map((g) => {
        const isOpen = open === g.label;
        const panelId = `${uid}-${g.label.replace(/\s+/g, "-")}`;
        return (
          <div key={g.label} className="md:py-0">
            <button
              type="button"
              aria-expanded={isOpen}
              aria-controls={panelId}
              onClick={() => setOpen(isOpen ? null : g.label)}
              className="flex min-h-14 w-full cursor-pointer items-center justify-between text-left text-[15px] font-bold text-white md:pointer-events-none md:min-h-0 md:cursor-default md:pb-3"
            >
              {g.label}
              <ChevronDownIcon aria-hidden className={cn("h-4 w-4 transition-transform md:hidden", isOpen && "rotate-180")} />
            </button>
            <ul id={panelId} className={cn("flex-col pb-4 md:flex md:pb-0", isOpen ? "flex" : "hidden")}>
              {g.items.map((item) => (
                <li key={item.label}>
                  {item.soon ? (
                    <span className="inline-flex min-h-8 items-center gap-1.5 text-[13.5px] text-white/50">
                      {item.label}
                      <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[9.5px] font-semibold leading-none text-white/70">Soon</span>
                    </span>
                  ) : (
                    <Link
                      href={item.href}
                      className="inline-flex min-h-8 items-center text-[13.5px] text-white/70 transition-colors hover:text-white focus-visible:text-white"
                    >
                      {item.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDownIcon, Tooltip, cn } from "@kiwiply/ui";
import type { NavSection, ShellNavItem } from "@/lib/ent/shell";
import { NavIcon } from "./nav-icons";

const ROW =
  "group relative flex min-h-10 w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-[15px] font-medium leading-tight text-ink/80 transition-colors " +
  "hover:bg-paper-2 hover:text-ink";
const ACTIVE = "bg-accent-soft font-semibold text-accent-deep hover:bg-accent-soft hover:text-accent-deep";

function Dot() {
  return <span aria-label="needs attention" data-nav-badge="attention" className="ml-auto h-2 w-2 flex-none rounded-full bg-danger" />;
}

/**
 * The menu (16 s2.1): sections separated by a rule, the active page highlighted (`aria-current="page"`), HR/Finance expandable.
 * `collapsed` is the 64 px rail: icons only, each with a tooltip. Items the member may not open are not in `sections` at all.
 */
export default function ShellNav({
  sections,
  active,
  collapsed = false,
  onNavigate,
  label = "Main",
}: {
  sections: NavSection[];
  active: string | null;
  collapsed?: boolean;
  onNavigate?: () => void;
  label?: string;
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const isOpen = (item: ShellNavItem) => open[item.key] ?? !!item.children?.some((c) => c.key === active);

  const link = (item: ShellNavItem, opts: { child?: boolean } = {}) => {
    const on = active === item.key;
    if (item.soon) {
      // a page that is not open to this member yet: shown, greyed, and it leads to the honest "on the way" page
      const row = (
        <Link
          href={item.href}
          aria-label={collapsed ? `${item.text} (soon)` : undefined}
          onClick={onNavigate}
          data-nav-item={item.key}
          data-nav-soon="true"
          className={cn(ROW, "text-ink/45 hover:text-ink/70", collapsed && "justify-center px-0")}
        >
          <NavIcon name={item.icon} className="flex-none text-muted/70" />
          {collapsed ? null : <span className="min-w-0 flex-1 truncate">{item.text}</span>}
          {collapsed ? null : item.key === "hr" || item.key === "finance" ? <ChevronDownIcon size={14} className="flex-none text-muted/70" /> : <span data-soon-chip className="flex-none rounded-full bg-paper-2 px-1.5 py-px text-[10.5px] font-bold uppercase tracking-wide text-muted">Soon</span>}
        </Link>
      );
      return collapsed ? (
        <Tooltip content={`${item.text} (soon)`} side="right" className="flex w-full">
          {row}
        </Tooltip>
      ) : (
        row
      );
    }
    const row = (
      <Link
        href={item.href}
        aria-current={on ? "page" : undefined}
        aria-label={collapsed ? item.text : undefined}
        onClick={onNavigate}
        data-nav-item={item.key}
        className={cn(ROW, on && ACTIVE, collapsed && "justify-center px-0", opts.child && "min-h-8 py-1.5 text-[13.5px]")}
      >
        {opts.child ? null : <NavIcon size={20} name={item.icon} className={cn("flex-none", on ? "text-accent" : "text-ink/70 group-hover:text-ink")} />}
        {collapsed ? null : <span className="min-w-0 flex-1 truncate">{item.text}</span>}
        {item.badge === "attention" ? <Dot /> : null}
      </Link>
    );
    return collapsed ? (
      <Tooltip content={item.text} side="right" className="flex w-full">
        {row}
      </Tooltip>
    ) : (
      row
    );
  };

  return (
    <nav aria-label={label} className="px-3.5 py-2">
      {sections.map((section, i) => (
        <div key={section.id} className={cn(i > 0 && "mt-3 border-t border-line pt-3")} data-nav-section={section.id}>
          <ul className="flex flex-col gap-1">
            {section.items.map((item) => {
              if (!item.children || collapsed) return <li key={item.key}>{link(item)}</li>;
              const expanded = isOpen(item);
              const childActive = item.children.some((c) => c.key === active);
              return (
                <li key={item.key}>
                  <button
                    type="button"
                    aria-expanded={expanded}
                    aria-controls={`nav-sub-${item.key}`}
                    onClick={() => setOpen((o) => ({ ...o, [item.key]: !expanded }))}
                    data-nav-item={item.key}
                    className={cn(ROW, childActive && !expanded && ACTIVE)}
                  >
                    <NavIcon size={20} name={item.icon} className="flex-none text-ink/70 group-hover:text-ink" />
                    <span className="min-w-0 flex-1 truncate">{item.text}</span>
                    <ChevronDownIcon size={14} className={cn("flex-none text-muted transition-transform", expanded && "rotate-180")} />
                  </button>
                  {expanded ? (
                    <ul id={`nav-sub-${item.key}`} className="ml-[21px] mt-0.5 flex flex-col gap-0.5 border-l border-line pl-2">
                      {item.children.map((c) => (
                        <li key={c.key}>{link(c, { child: true })}</li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

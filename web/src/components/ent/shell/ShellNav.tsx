"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDownIcon, Tooltip, cn } from "@kiwiply/ui";
import type { NavSection, ShellNavItem } from "@/lib/ent/shell";
import { NavIcon } from "./nav-icons";

/** One menu row: sizes, colours and the light-blue active pill live in `.ent-nav-row` (packages/ui/styles/theme-tenant.css). */
const ROW = "ent-nav-row group relative text-left";
const ACTIVE = "";

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
          title="On the way"
          data-rail={collapsed ? "true" : undefined}
          className={ROW}
        >
          <NavIcon name={item.icon} />
          {collapsed ? null : <span className="min-w-0 flex-1 truncate">{item.text}</span>}
          {collapsed ? null : item.key === "hr" || item.key === "finance" ? <ChevronDownIcon size={14} className="flex-none opacity-70" /> : <span className="sr-only">(soon)</span>}
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
        data-rail={collapsed ? "true" : undefined}
        className={cn(ROW, on && ACTIVE, opts.child && "!min-h-8 !text-[0.93em]")}
      >
        {opts.child ? null : <NavIcon size={20} name={item.icon} />}
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
    <nav aria-label={label} className="ent-nav">
      {sections.map((section, i) => (
        <div key={section.id} data-nav-section={section.id}>
          {i > 0 ? <hr aria-hidden className="ent-nav-sep" /> : null}
          <ul className="flex flex-col">
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
                    aria-current={childActive && !expanded ? "page" : undefined}
                    className={ROW}
                  >
                    <NavIcon size={20} name={item.icon} />
                    <span className="min-w-0 flex-1 truncate">{item.text}</span>
                    <ChevronDownIcon size={14} className={cn("flex-none opacity-70 transition-transform", expanded && "rotate-180")} />
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

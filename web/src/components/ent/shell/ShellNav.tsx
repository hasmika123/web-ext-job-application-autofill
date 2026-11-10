"use client";

import Link from "next/link";
import { Tooltip, cn } from "@kiwiply/ui";
import type { NavSection, ShellNavItem } from "@/lib/ent/shell";
import { NavIcon } from "./nav-icons";

/** One menu row: sizes, colours and the light-blue active pill live in `.ent-nav-row` (packages/ui/styles/theme-tenant.css). */
const ROW = "ent-nav-row group relative text-left";

function Dot() {
  return <span aria-label="needs attention" data-nav-badge="attention" className="ml-auto h-2 w-2 flex-none rounded-full bg-danger" />;
}

/**
 * The menu (16 s2.1): labelled groups ("People", "Pipeline"; the collapsed rail draws a rule instead of the label), the active page
 * highlighted (`aria-current="page"`). `collapsed` is the 64 px rail: icons only, each with a tooltip. Items the member may not open are
 * not in `sections` at all.
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
  const link = (item: ShellNavItem) => {
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
          {collapsed ? null : (
            <span data-soon-chip className="flex-none rounded-md bg-paper-2 px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-muted">
              Soon<span className="sr-only"> (soon)</span>
            </span>
          )}
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
        className={cn(ROW)}
      >
        <NavIcon size={20} name={item.icon} />
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
      {sections.map((section, i) => {
        const headingId = section.label ? `nav-group-${label}-${section.id}` : undefined;
        return (
          <div key={`${section.id}-${i}`} data-nav-section={section.id} role={section.label ? "group" : undefined} aria-labelledby={collapsed ? undefined : headingId} aria-label={collapsed && section.label ? section.label : undefined}>
            {section.label && !collapsed ? (
              <p id={headingId} data-nav-group-label className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--ent-soft)]">
                {section.label}
              </p>
            ) : i > 0 ? (
              <hr aria-hidden className="ent-nav-sep" />
            ) : null}
            <ul className="flex flex-col">
              {section.items.map((item) => (
                <li key={item.key}>{link(item)}</li>
              ))}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

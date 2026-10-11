"use client";

import { Menu, MoreVerticalIcon, cn, type MenuEntry } from "@kiwiply/ui";

const TRIGGER =
  "inline-flex h-8 w-8 items-center justify-center rounded-lg text-v2-ink-soft hover:bg-paper-2 hover:text-ink";

/**
 * The row "⋮" button. With `items` it opens a dropdown menu; without, it is a plain inert button
 * (the org boards show the control before any actions exist behind it).
 */
export function KebabMenu({
  items,
  label = "More actions",
  className,
}: {
  items?: MenuEntry[];
  label?: string;
  className?: string;
}) {
  if (!items) {
    return (
      <button type="button" aria-label={label} className={cn(TRIGGER, className)}>
        <MoreVerticalIcon size={16} />
      </button>
    );
  }
  return (
    <Menu
      align="end"
      items={items}
      trigger={
        <span className={cn(TRIGGER, className)}>
          <span className="sr-only">{label}</span>
          <MoreVerticalIcon aria-hidden size={16} />
        </span>
      }
    />
  );
}

export default KebabMenu;

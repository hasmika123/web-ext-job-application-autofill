import type { ComponentType, ReactNode } from "react";
import { cn } from "../primitives/cn";
import { ChevronRightIcon } from "../primitives/icons";
import type { IconProps } from "../primitives/icons";

/**
 * QuickActionTiles - the row of big, thumb-sized shortcuts on a dashboard (16 s7). Each tile is a link when it has an
 * `href` and a button when it has `onClick`; the optional badge is a count ("3 to review"), never decoration.
 * 1 column on a 360 phone, 2 from `sm`, 4 from `xl`; every tile is at least 56 px tall.
 */
export interface QuickAction {
  id: string;
  label: string;
  description?: string;
  icon?: ComponentType<IconProps>;
  href?: string;
  onClick?: () => void;
  /** A count or short word; hidden when null, undefined or 0. */
  badge?: number | string | null;
}

const TILE =
  "group flex min-h-14 items-center gap-3 rounded-[var(--radius)] border border-line bg-paper px-3.5 py-3 text-left " +
  "transition-colors hover:bg-paper-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

function Inner({ a }: { a: QuickAction }): ReactNode {
  const Icon = a.icon;
  const showBadge = a.badge != null && a.badge !== 0 && a.badge !== "";
  return (
    <>
      {Icon && (
        <span aria-hidden className="grid h-9 w-9 flex-none place-items-center rounded-full bg-accent-soft text-accent-deep">
          <Icon size={18} />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-semibold text-ink">{a.label}</span>
        {a.description && <span className="block truncate text-[12px] text-muted">{a.description}</span>}
      </span>
      {showBadge && <span className="flex-none rounded-full bg-accent px-2 py-[2px] text-[11.5px] font-bold tabular-nums text-on-accent">{a.badge}</span>}
      <ChevronRightIcon aria-hidden size={16} className="flex-none text-muted transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" />
    </>
  );
}

export default function QuickActionTiles({ actions, label = "Quick actions", className }: { actions: QuickAction[]; label?: string; className?: string }) {
  return (
    <ul aria-label={label} className={cn("grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-4", className)}>
      {actions.map((a) => (
        <li key={a.id} className="min-w-0">
          {a.href ? (
            <a href={a.href} className={TILE}>
              <Inner a={a} />
            </a>
          ) : (
            <button type="button" onClick={a.onClick} className={cn(TILE, "w-full")}>
              <Inner a={a} />
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

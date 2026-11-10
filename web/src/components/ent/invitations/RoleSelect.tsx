"use client";

import { useId, useState } from "react";
import { ChevronDownIcon, cn } from "@kiwiply/ui";
import type { RoleOption } from "@/lib/ent/invitations";

/**
 * Multi-select of roles: a button showing what is picked, and a checklist that opens IN the page flow (it pushes the form down
 * instead of floating, so it never gets clipped inside a sheet). The first role picked is the primary one. Keyboard: Tab to the
 * button, Enter or Space opens it, Tab walks the checkboxes, Escape closes and returns to the button.
 */
export default function RoleSelect({
  options,
  value,
  onChange,
  id,
  invalid,
  describedBy,
  disabled,
  placeholder = "Select a role",
}: {
  options: RoleOption[];
  value: number[];
  onChange: (ids: number[]) => void;
  id: string;
  invalid?: boolean;
  describedBy?: string;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const names = value.map((v) => options.find((o) => o.id === v)?.name).filter((n): n is string => !!n);
  const toggle = (rid: number) => onChange(value.includes(rid) ? value.filter((v) => v !== rid) : [...value, rid]);
  return (
    <div
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          e.stopPropagation();
          setOpen(false);
          document.getElementById(id)?.focus();
        }
      }}
    >
      <button
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={listId}
        aria-describedby={describedBy}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex min-h-11 w-full items-center justify-between gap-2 rounded-[var(--radius)] border bg-paper px-3 py-2 text-left text-[16px] sm:min-h-0 sm:text-sm",
          invalid ? "border-danger" : "border-line focus:border-accent",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60",
        )}
      >
        <span className={cn("min-w-0 truncate", names.length === 0 && "text-muted")}>{names.length === 0 ? placeholder : names.join(", ")}</span>
        <ChevronDownIcon aria-hidden size={16} className={cn("flex-none text-muted transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <ul id={listId} aria-label="Roles" className="mt-1.5 max-h-52 overflow-auto rounded-[var(--radius)] border border-line bg-paper py-1">
          {options.map((o) => (
            <li key={o.id}>
              <label className="flex min-h-11 cursor-pointer items-start gap-2.5 px-3 py-2 text-[13.5px] hover:bg-paper-2 sm:min-h-0">
                <input type="checkbox" className="mt-0.5 h-4 w-4 flex-none accent-accent" checked={value.includes(o.id)} onChange={() => toggle(o.id)} />
                <span className="min-w-0">
                  <span className="block font-medium text-ink">{o.name}</span>
                  {o.description && <span className="block truncate text-[12px] text-muted">{o.description}</span>}
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

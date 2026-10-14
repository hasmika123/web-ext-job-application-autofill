"use client";

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { IconButton, Menu, MemberAvatar, MoreHorizontalIcon, Tooltip } from "@kiwiply/ui";
import type { MenuEntry } from "@kiwiply/ui";
import { skillChips, statusLabel, type MatchSummary } from "@/lib/ent/jobs";

/** One tone per job status (the boards' pills: Open green, In Review blue, Filled purple, On Hold amber, Closed grey). */
const STATUS_TONE: Record<string, string> = {
  OPEN: "green",
  IN_REVIEW: "blue",
  ON_HOLD: "amber",
  FILLED: "purple",
  CLOSED: "grey",
};

export function StatusPill({ status, className = "", trailing }: { status: string; className?: string; trailing?: ReactNode }) {
  return (
    <span data-job-status={status} className={`ent-pill ent-pill-lg justify-center ${className}`} data-tone={STATUS_TONE[status] ?? "grey"} data-shape="round">
      {statusLabel(status)}
      {trailing}
    </span>
  );
}

/** The first skills as soft chips and "+N" (the rest in a tooltip). */
export function SkillChips({ skills, max = 3, size = "sm" }: { skills: string[]; max?: number; size?: "sm" | "md" }) {
  if (skills.length === 0) return null;
  const { shown, more } = skillChips(skills, max);
  const cls = `inline-flex items-center whitespace-nowrap rounded-md bg-[var(--ent-x-eaf1fe)] font-medium leading-none text-[var(--ent-x-2f56b8)] ${size === "md" ? "px-2 py-[5px] text-[10.5px]" : "px-1.5 py-[4px] text-[9.5px]"}`;
  return (
    <ul aria-label="Skills" className="flex flex-wrap items-center gap-1" data-skill-chips>
      {shown.map((s) => (
        <li key={s} className={cls}>
          {s}
        </li>
      ))}
      {more > 0 && (
        <li>
          <Tooltip content={skills.slice(max).join(", ")} side="top">
            <span tabIndex={0} aria-label={`${more} more skills: ${skills.slice(max).join(", ")}`} className={`${cls} !bg-[var(--ent-x-f1f4f9)] !text-[var(--ent-x-46527e)]`}>
              +{more}
            </span>
          </Tooltip>
        </li>
      )}
    </ul>
  );
}

/** The overlapping initials of the best matches, "+N" for the rest, and the best score under them. No photos exist. */
export function MatchStack({ matches }: { matches: MatchSummary }) {
  if (matches.count === 0 || matches.best === null) {
    return (
      <span className="text-[10.5px] text-[var(--ent-soft)]" data-no-matches>
        No matches yet
      </span>
    );
  }
  const rest = matches.count - matches.top.length;
  return (
    <div className="flex flex-col items-start gap-1" data-match-stack>
      <div className="flex items-center">
        <ul aria-label="Best matching consultants" className="flex -space-x-1.5">
          {matches.top.map((m) => (
            <li key={m.consultantId} title={`${m.name} (${m.score}%)`} className="rounded-full ring-2 ring-white">
              <MemberAvatar name={m.name} size={24} />
            </li>
          ))}
        </ul>
        {rest > 0 && <span className="ml-1 text-[9.5px] font-medium text-[var(--ent-soft)]">+{rest}</span>}
      </div>
      <span className="text-[10.5px] font-semibold text-[var(--ent-x-17995c)] tabular-nums" data-best-score>
        {matches.best}% match
      </span>
    </div>
  );
}

/** A native checkbox in the brand colour; `indeterminate` is set through the ref. */
export function Check({ checked, indeterminate, onChange, label }: { checked: boolean; indeterminate?: boolean; onChange: (on: boolean) => void; label: string }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = !!indeterminate;
  }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      aria-label={label}
      onChange={(e) => onChange(e.target.checked)}
      onClick={(e) => e.stopPropagation()}
      className="h-[14px] w-[14px] cursor-pointer rounded border-line accent-[var(--brand-primary,var(--color-accent))]"
    />
  );
}

export function Kebab({ items, label = "Row actions" }: { items: MenuEntry[]; label?: string }) {
  return (
    <Menu
      trigger={
        <IconButton aria-label={label} title={label} className="ent-kebab">
          <MoreHorizontalIcon size={15} />
        </IconButton>
      }
      items={items}
    />
  );
}

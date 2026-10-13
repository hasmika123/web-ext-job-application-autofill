"use client";

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { IconButton, Menu, MemberAvatar, MoreHorizontalIcon, Tooltip } from "@kiwiply/ui";
import type { MenuEntry } from "@kiwiply/ui";
import { skillChips, statusLabel, type MatchSummary } from "@/lib/ent/jobs";

/** One tone per job status, from the tenant-aware v2 tokens (never a literal colour). */
const STATUS_TONE: Record<string, string> = {
  OPEN: "bg-v2-green-soft text-v2-green-ink",
  IN_REVIEW: "bg-accent-soft text-accent-deep",
  ON_HOLD: "bg-v2-amber-soft text-v2-amber-ink",
  FILLED: "bg-v2-violet-soft text-v2-violet-ink",
  CLOSED: "bg-paper-2 text-ink-soft",
};

export function StatusPill({ status, className = "", trailing }: { status: string; className?: string; trailing?: ReactNode }) {
  return (
    <span data-job-status={status} className={`inline-flex items-center justify-center rounded-full px-3.5 py-1.5 text-[12.5px] font-medium leading-none whitespace-nowrap ${STATUS_TONE[status] ?? STATUS_TONE.CLOSED} ${className}`}>
      {statusLabel(status)}
      {trailing}
    </span>
  );
}

/** The first skills as soft chips and "+N" (the rest in a tooltip). */
export function SkillChips({ skills, max = 3, size = "sm" }: { skills: string[]; max?: number; size?: "sm" | "md" }) {
  if (skills.length === 0) return null;
  const { shown, more } = skillChips(skills, max);
  const cls = `inline-flex items-center rounded-md bg-accent-soft font-medium leading-none text-accent-deep ${size === "md" ? "px-2.5 py-1.5 text-[12.5px]" : "px-2 py-1.5 text-[11.5px]"}`;
  return (
    <ul aria-label="Skills" className="flex flex-wrap items-center gap-1.5" data-skill-chips>
      {shown.map((s) => (
        <li key={s} className={cls}>
          {s}
        </li>
      ))}
      {more > 0 && (
        <li>
          <Tooltip content={skills.slice(max).join(", ")} side="top">
            <span tabIndex={0} aria-label={`${more} more skills: ${skills.slice(max).join(", ")}`} className="inline-flex items-center rounded-md bg-paper-2 px-2 py-1.5 text-[12px] font-medium leading-none text-ink-soft">
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
      <span className="text-[12.5px] text-muted" data-no-matches>
        No matches yet
      </span>
    );
  }
  const rest = matches.count - matches.top.length;
  return (
    <div className="flex flex-col items-start gap-1" data-match-stack>
      <div className="flex items-center">
        <ul aria-label="Best matching consultants" className="flex -space-x-2">
          {matches.top.map((m) => (
            <li key={m.consultantId} title={`${m.name} (${m.score}%)`} className="rounded-full ring-2 ring-paper">
              <MemberAvatar name={m.name} size={30} />
            </li>
          ))}
        </ul>
        {rest > 0 && <span className="ml-1.5 text-[12px] font-medium text-ink-soft">+{rest}</span>}
      </div>
      <span className="text-[13px] font-semibold text-v2-green-ink tabular-nums" data-best-score>
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
      className="h-4 w-4 cursor-pointer rounded border-line accent-[var(--brand-primary,var(--color-accent))]"
    />
  );
}

export function Kebab({ items, label = "Row actions" }: { items: MenuEntry[]; label?: string }) {
  return (
    <Menu
      trigger={
        <IconButton aria-label={label} title={label} className="!h-8 !w-8 border border-line bg-paper text-ink-soft">
          <MoreHorizontalIcon size={16} />
        </IconButton>
      }
      items={items}
    />
  );
}

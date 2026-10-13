"use client";

import { MemberAvatar, Meter, StatePill, hasStateMap, registerStateMap } from "@kiwiply/ui";
import { AVAILABILITY_LABEL, LICENSE_LABEL, type PersonRef } from "@/lib/ent/consultants";

/** Availability and license chips: one StatePill domain each, so every enterprise page draws them the same way. */
if (!hasStateMap("consultant-availability")) {
  registerStateMap("consultant-availability", { AVAILABLE: "green", ON_PROJECT: "grey", NOTICE: "amber", UNAVAILABLE: "red" });
}
if (!hasStateMap("consultant-license")) {
  registerStateMap("consultant-license", { ACTIVE: "green", EXPIRING: "amber", PENDING: "amber-outline", NEEDS_REVIEW: "red" });
}

export function AvailabilityPill({ value }: { value: string }) {
  return <StatePill domain="consultant-availability" state={value} label={AVAILABILITY_LABEL[value] ?? value} />;
}

export function LicensePill({ value }: { value: string }) {
  return <StatePill domain="consultant-license" state={value} label={LICENSE_LABEL[value] ?? value} />;
}

/** The primary-skill chips of the table (soft brand tint); more than `max` collapse into "+N". */
export function SkillChips({ skills, extra = 0, max = 2 }: { skills: string[]; extra?: number; max?: number }) {
  if (skills.length === 0) return <span className="text-muted">{"—"}</span>;
  const shown = skills.slice(0, max);
  const more = skills.length - shown.length + extra;
  return (
    <span className="flex max-w-[11rem] flex-wrap gap-1" data-skill-chips>
      {shown.map((s) => (
        <span key={s} className="inline-flex max-w-full items-center truncate rounded-md bg-accent-soft px-2 py-[3px] text-[11.5px] font-semibold leading-none text-accent-deep">
          {s}
        </span>
      ))}
      {more > 0 && <span className="inline-flex items-center rounded-md bg-paper-2 px-1.5 py-[3px] text-[11.5px] font-semibold leading-none text-ink-soft">+{more}</span>}
    </span>
  );
}

/** A marketer as a small initials circle and a name; an unassigned consultant reads "Unassigned" (never a made-up name). */
export function MarketerCell({ marketer, size = 24 }: { marketer: PersonRef | null; size?: number }) {
  if (!marketer)
    return (
      <span className="text-[12.5px] text-muted" data-unassigned>
        Unassigned
      </span>
    );
  return (
    <span className="flex min-w-0 items-center gap-2">
      <MemberAvatar name={marketer.name} size={size} />
      <span className="truncate text-[13px] text-ink">{marketer.name}</span>
    </span>
  );
}

/** The small profile-completeness ring of a row. */
export function ProfileRing({ value, size = 34 }: { value: number; size?: number }) {
  const pct = Math.round(Math.min(100, Math.max(0, value)));
  return (
    <Meter variant="ring" value={pct} max={100} label="Profile completeness" valueText={`${pct} percent`} size={size} neutral>
      <span className="text-[10px] font-bold tabular-nums text-ink">{pct}%</span>
    </Meter>
  );
}

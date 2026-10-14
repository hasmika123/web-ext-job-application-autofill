"use client";

import type { ComponentType } from "react";
import { ArrowRightIcon, BuildingIcon, CalendarIcon, CheckCircleIcon, FileTextIcon, MailIcon, MemberAvatar, MessageIcon, PhoneIcon, SendIcon, TrophyIcon, UsersIcon, cn } from "@kiwiply/ui";
import type { IconProps } from "@kiwiply/ui";
import { logoFor, photoFor, type ActivityStatus } from "@/lib/ent/marketer-ws/activity";
import { TINTS, type TintName } from "../parts";

/** Small pieces shared by the Activities table, the rail and the dialogs: type icons, chips, person and client cells. Tenant tokens only. */

interface IconSpec { icon: ComponentType<IconProps>; tint: TintName }

const GROUP_ICON: Record<string, IconSpec> = {
  RESUME: { icon: FileTextIcon, tint: "green" },
  OPPORTUNITY: { icon: UsersIcon, tint: "violet" },
  SUBMISSION: { icon: SendIcon, tint: "pink" },
  FOLLOWUP: { icon: PhoneIcon, tint: "amber" },
  INTERVIEW: { icon: CalendarIcon, tint: "violet" },
  FEEDBACK: { icon: MessageIcon, tint: "amber" },
  APPLICATION: { icon: ArrowRightIcon, tint: "green" },
  OFFER: { icon: TrophyIcon, tint: "pink" },
  PLACEMENT: { icon: CheckCircleIcon, tint: "green" },
};
/** Upcoming rows name an icon (a channel or a group); anything unknown is the calendar. */
const KEY_ICON: Record<string, IconSpec> = {
  phone: GROUP_ICON.FOLLOWUP, mail: { icon: MailIcon, tint: "blue" }, message: GROUP_ICON.FEEDBACK, calendar: GROUP_ICON.INTERVIEW,
  resume: GROUP_ICON.RESUME, opportunity: GROUP_ICON.OPPORTUNITY, submission: GROUP_ICON.SUBMISSION, followup: GROUP_ICON.FOLLOWUP, interview: GROUP_ICON.INTERVIEW,
  feedback: GROUP_ICON.FEEDBACK, application: GROUP_ICON.APPLICATION, offer: GROUP_ICON.OFFER, placement: GROUP_ICON.PLACEMENT,
};

export const groupIcon = (group: string): IconSpec => GROUP_ICON[group] ?? GROUP_ICON.APPLICATION;
export const keyIcon = (key: string): IconSpec => KEY_ICON[key] ?? GROUP_ICON.INTERVIEW;
/** The board draws "Candidate Submitted to Client" with the blue people icon; every other type uses its group's icon. */
export const typeIcon = (type: string, group: string): IconSpec => (type === "CANDIDATE_SUBMITTED" ? { icon: UsersIcon, tint: "blue" } : groupIcon(group));

export function IconTile({ spec, size = 36 }: { spec: IconSpec; size?: number }) {
  const Icon = spec.icon;
  return (
    <span aria-hidden className={cn("grid flex-none place-items-center rounded-[10px]", TINTS[spec.tint])} style={{ width: size, height: size }}>
      <Icon size={Math.round(size * 0.55)} />
    </span>
  );
}

/** A short outcome tag reads green; every other second chip is violet (as the board). */
const POSITIVE = new Set(["positive", "success", "closed", "active", "completed", "approved"]);
export const tagTone = (tag: string): string => (POSITIVE.has(tag.trim().toLowerCase()) ? TINTS.green : TINTS.violet);

export function Chip({ children, className }: { children: string; className: string }) {
  return <span className={cn("inline-block whitespace-nowrap rounded-md px-2.5 py-1 text-[12px] font-semibold", className)}>{children}</span>;
}

export const STATUS_CHIP: Record<ActivityStatus, string> = { COMPLETED: TINTS.green, SCHEDULED: TINTS.violet, CANCELLED: "bg-paper-2 text-muted" };

export function PersonCell({ name, url }: { name: string | null | undefined; url?: string | null }) {
  if (!name) return <span className="text-muted">—</span>;
  return (
    <span className="flex items-center gap-2 whitespace-nowrap text-ink-soft">
      <MemberAvatar name={name} src={photoFor(name, url ?? null)} size={30} />
      {name}
    </span>
  );
}

export function ClientCell({ name }: { name: string | null | undefined }) {
  if (!name) return <span className="text-muted">—</span>;
  const logo = logoFor(name);
  return (
    <span className="flex items-center gap-2 whitespace-nowrap text-ink-soft">
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element -- approved board art, served as is
        <img src={logo} alt="" aria-hidden className="h-6 w-6 flex-none rounded object-contain" />
      ) : (
        <span aria-hidden className={cn("grid h-6 w-6 flex-none place-items-center rounded", TINTS.blue)}>
          <BuildingIcon size={14} />
        </span>
      )}
      {name}
    </span>
  );
}

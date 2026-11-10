"use client";

import type { ComponentType, HTMLAttributes, ReactNode } from "react";
import { InfoIcon, Select, Tooltip, cn } from "@kiwiply/ui";
import type { IconProps } from "@kiwiply/ui";
import { TINTS, type TintName } from "../parts";

/** Small pieces shared by the Performance cards. */

/** What a card's info icon says: the exact formula behind its numbers. */
export const INFO = {
  weekly: "Submissions counted by the Monday-to-Sunday week they were applied. Interviews and Offers are the part of those submissions that reached the Interviewing or Offer stage.",
  trend: "Running totals over the period of submissions, interviews (reached Interviewing) and offers (reached Offer). The end value of each line is its total for the period.",
  funnel: "Submissions, then the part of them that reached Interviewing, then Offer, then placements that started in the period. Each percentage is that stage divided by submissions.",
  readiness:
    "Your active consultants. Inactive: on a project or unavailable. Needs attention: resume needs an update or profile under 50% complete. Ready to Submit: up-to-date resume, available now, profile at least 70% complete. In Progress: everyone else.",
  streams: "Per client, over the period. Offer Rate = offers divided by submissions; green when it is at or above your overall offer rate for the period, red below it.",
  top: "Your consultants ranked by placements, then offers, interviews and submissions over the last 3 months. Match Rate is the average match score of the consultant's matches (not dismissed). Trend is submissions per week over the last 8 weeks.",
} as const;

/** The (i) after a card title; its tooltip and accessible name carry the formula. */
export function Info({ text, what }: { text: string; what: string }) {
  return (
    <Tooltip content={text} side="bottom">
      <button type="button" aria-label={`About ${what}: ${text}`} data-info={what} className="inline-grid h-5 w-5 flex-none place-items-center rounded-full text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-accent">
        <InfoIcon size={14} aria-hidden />
      </button>
    </Tooltip>
  );
}

/** Card header: tinted icon, bold title, its info icon, then the card's filters on the right. */
export function CardHead({ icon: Icon, title, tint = "blue", info, size = "lg", children }: { icon: ComponentType<IconProps>; title: string; tint?: TintName; info?: string; size?: "lg" | "sm"; children?: ReactNode }) {
  return (
    <header className="mb-3 flex flex-wrap items-center gap-2">
      <span aria-hidden className={cn("grid flex-none place-items-center rounded-[9px]", size === "lg" ? "h-8 w-8" : "h-7 w-7", TINTS[tint])}>
        <Icon size={size === "lg" ? 18 : 16} />
      </span>
      <h2 className={cn("min-w-0 truncate font-bold text-ink", size === "lg" ? "text-[16.5px]" : "text-[14.5px]")}>{title}</h2>
      {info ? <Info text={info} what={title} /> : null}
      <span className="flex-1" />
      {children}
    </header>
  );
}

/** The period select of a card (a small bordered dropdown, as on the board). */
export function PeriodSelect({ value, onChange, options, label, width = "w-[148px]" }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; label: string; width?: string }) {
  return <Select value={value} onChange={onChange} options={options} aria-label={label} className={cn("h-9 flex-none", width)} />;
}

/** A soft rounded chip: green or red (the Offer Rate), amber (a middling Match Rate). */
export function Chip({ tone, children, ...rest }: { tone: "green" | "red" | "amber"; children: ReactNode } & HTMLAttributes<HTMLSpanElement>) {
  const cls = tone === "green" ? "bg-v2-green-soft text-v2-green-ink" : tone === "red" ? "bg-v2-pink-soft text-v2-pink-ink" : "bg-v2-amber-soft text-v2-amber-ink";
  return (
    <span {...rest} className={cn("inline-block min-w-[3.25rem] rounded-md px-2.5 py-1 text-center text-[12.5px] font-bold", cls)}>
      {children}
    </span>
  );
}

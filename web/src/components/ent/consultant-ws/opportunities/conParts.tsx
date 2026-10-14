"use client";

import type { ReactNode } from "react";
import { SourceLogo, cn } from "@kiwiply/ui";
import { TINTS, type TintName } from "@/components/ent/marketer-ws/parts";
import { STATE_LABELS, sourceName, type ConOpportunityDTO, type ConState, type Priority } from "@/lib/ent/consultant-ws/conOpportunities";

/**
 * Shared bits of the Consultant workspace pages (`/w/consultant/**`). The page frame pieces (`Head`, `Empty`, `CardSkeleton`,
 * `HelpBannerCard`, `CARD`, `TINTS`) are the Marketing workspace's, re-exported so the two workspaces stay one design; colours come only
 * from tenant tokens, never a hex literal.
 */
export { CARD, CardSkeleton, Empty, Head, HelpBannerCard, TINTS } from "@/components/ent/marketer-ws/parts";
export type { TintName } from "@/components/ent/marketer-ws/parts";

export interface ConPageProps {
  orgId: number;
  orgName: string;
  firstName: string;
  /** Menu hrefs of this member's Consultant workspace by nav key (`home`, `matches`, `opportunities`, `applications`, ...); null/absent hides a link. */
  hrefs: Record<string, string | null>;
  /** The opportunity id when the URL is `/w/consultant/opportunities/{id}`; null on the list. */
  detailId?: number | null;
}

const STATE_TINT: Record<ConState, TintName | "muted"> = {
  ASSIGNED: "blue",
  VIEWED: "teal",
  INTERESTED: "green",
  NEEDS_INFO: "amber",
  APPLIED: "violet",
  DECLINED: "muted",
  CLOSED: "muted",
};
const MUTED = "bg-paper-2 text-ink-soft";
const CHIP = "inline-flex min-h-6 items-center gap-1 whitespace-nowrap rounded-full px-2.5 text-[12px] font-semibold";

export function StateChip({ state }: { state: ConState }) {
  const tint = STATE_TINT[state];
  return (
    <span data-state-chip={state} className={cn(CHIP, tint === "muted" ? MUTED : TINTS[tint])}>
      {STATE_LABELS[state]}
    </span>
  );
}

const PRIORITY_CLASS: Record<Priority, string> = { HIGH: TINTS.coral, MEDIUM: TINTS.amber, LOW: MUTED };
const PRIORITY_LABEL: Record<Priority, string> = { HIGH: "High priority", MEDIUM: "Medium priority", LOW: "Low priority" };
export function PriorityChip({ priority }: { priority: Priority }) {
  return (
    <span data-priority-chip={priority} className={cn(CHIP, PRIORITY_CLASS[priority])}>
      {PRIORITY_LABEL[priority]}
    </span>
  );
}

const MODE_LABEL = { REMOTE: "Remote", HYBRID: "Hybrid", ONSITE: "On-site" } as const;
/** Work mode, employment type and pay label as plain chips (what the job is, not how it is going). */
export function JobChips({ job, pay = true }: { job: ConOpportunityDTO["job"]; pay?: boolean }) {
  const chips = [job.workMode ? MODE_LABEL[job.workMode] : "", job.employmentType, pay ? job.payLabel : ""].filter(Boolean);
  if (chips.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-1.5">
      {chips.map((c) => (
        <span key={c} className={cn(CHIP, "bg-paper-2 font-medium text-ink-soft")}>
          {c}
        </span>
      ))}
    </span>
  );
}

/** The source of the posting: the board's logo tile when we know the platform, and its name as text either way. */
export function SourceBadge({ atsPlatform, size = 22 }: { atsPlatform: string; size?: number }): ReactNode {
  const s = sourceName(atsPlatform);
  if (!s.label) return null;
  return (
    <span data-source-badge={s.label} className="inline-flex items-center gap-1.5 text-[12.5px] text-ink-soft">
      {s.known ? <SourceLogo source={s.label} size={size} /> : null}
      <span>{s.label}</span>
    </span>
  );
}

const DAY = 86_400_000;
/** "Oct 20" for a date-only value (no time zone shifting), and whether it is already past. */
export function dueInfo(dueOn: string | null, now: number = Date.now()): { text: string; overdue: boolean } | null {
  if (!dueOn) return null;
  const t = Date.parse(`${dueOn.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(t)) return null;
  const text = new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return { text, overdue: t + DAY <= now };
}

/** A date-only or instant value as "Oct 10". */
export function shortDate(iso: string | null): string {
  if (!iso) return "";
  const t = Date.parse(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  return Number.isNaN(t) ? "" : new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: iso.length === 10 ? "UTC" : undefined });
}

/** The marketer's note, cut for a card. Plain text only: it is rendered as a React text node, never as HTML. */
export function preview(text: string, max = 90): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}

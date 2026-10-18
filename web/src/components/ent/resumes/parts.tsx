"use client";

import { MemberAvatar, Tooltip } from "@kiwiply/ui";
import { approvalLabel, visibilityLabel, type Approval, type PersonRef, type ResumeRow, type Visibility } from "@/lib/ent/resumes";

type Tone = "green" | "blue" | "amber" | "red";

/** The board's small coloured pill: Primary and Approved green, Internal and Public blue, Pending amber, Private red (shared `.ent-pill`). */
function Pill({ tone, children, kind }: { tone: Tone; children: string; kind: string }) {
  return (
    <span data-pill={kind} data-tone={tone} className="ent-pill truncate">
      {children}
    </span>
  );
}

export function ApprovalPill({ status }: { status: Approval | string }) {
  return (
    <Pill kind="approval" tone={status === "APPROVED" ? "green" : status === "PENDING" ? "amber" : "red"}>
      {approvalLabel(status)}
    </Pill>
  );
}

export function VisibilityPill({ visibility }: { visibility: Visibility | string }) {
  return (
    <Pill kind="visibility" tone={visibility === "PRIVATE" ? "red" : "blue"}>
      {visibilityLabel(visibility)}
    </Pill>
  );
}

/** "Primary" when the resume is the consultant's primary one, otherwise a dash (as on the board). */
export function PrimaryCell({ primary }: { primary: boolean }) {
  return primary ? <Pill kind="primary" tone="green">Primary</Pill> : <span className="text-muted" aria-label="Not primary">{"—"}</span>;
}

/** The consultant: initials circle, name and email (no photos are stored). */
export function ConsultantCell({ row }: { row: ResumeRow }) {
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <MemberAvatar name={row.consultant.name} size={34} />
      <span className="min-w-0">
        <span className="block truncate text-[12px] font-bold text-[var(--ent-title)]">{row.consultant.name}</span>
        <span className="block truncate text-[9.5px] text-[var(--ent-soft)]">{row.consultant.email ?? row.consultant.jobTitle ?? ""}</span>
      </span>
    </span>
  );
}

/** The person who prepared the resume, as a small initials circle with the name for assistive tech and on hover. */
export function OwnerAvatar({ owner, size = 30, showName = false }: { owner: PersonRef | null; size?: number; showName?: boolean }) {
  if (!owner) return <span className="text-muted">{"—"}</span>;
  if (showName) {
    return (
      <span className="flex min-w-0 items-center gap-2">
        <MemberAvatar name={owner.name} size={size} />
        <span className="truncate text-[11.5px] text-ink">{owner.name}</span>
      </span>
    );
  }
  return (
    <Tooltip content={owner.name} side="top">
      <span className="inline-flex" aria-label={`Owner: ${owner.name}`} role="img">
        <MemberAvatar name={owner.name} size={size} />
      </span>
    </Tooltip>
  );
}

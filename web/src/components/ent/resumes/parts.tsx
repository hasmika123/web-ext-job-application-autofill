"use client";

import { MemberAvatar, PersonCell, Tooltip } from "@kiwiply/ui";
import { approvalLabel, visibilityLabel, type Approval, type PersonRef, type ResumeRow, type Visibility } from "@/lib/ent/resumes";

type Tone = "green" | "blue" | "amber" | "red";

const TONE: Record<Tone, string> = {
  green: "bg-v2-green-soft text-v2-green-ink",
  blue: "bg-accent-soft text-accent-deep",
  amber: "bg-brown-soft text-brown-deep",
  red: "bg-danger/10 text-danger-text",
};

/** The board's small coloured pill: Primary and Approved green, Internal and Public in the brand blue, Pending amber, Private red. */
function Pill({ tone, children, kind }: { tone: Tone; children: string; kind: string }) {
  return (
    <span data-pill={kind} data-tone={tone} className={`inline-flex max-w-full items-center truncate rounded-full px-2.5 py-[3px] text-[11.5px] font-semibold leading-none ${TONE[tone]}`}>
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
  return <PersonCell name={row.consultant.name} avatarName={row.consultant.name} sub={row.consultant.email ?? row.consultant.jobTitle ?? ""} />;
}

/** The person who prepared the resume, as a small initials circle with the name for assistive tech and on hover. */
export function OwnerAvatar({ owner, size = 28, showName = false }: { owner: PersonRef | null; size?: number; showName?: boolean }) {
  if (!owner) return <span className="text-muted">{"—"}</span>;
  if (showName) {
    return (
      <span className="flex min-w-0 items-center gap-2">
        <MemberAvatar name={owner.name} size={size} />
        <span className="truncate text-[13px] text-ink">{owner.name}</span>
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

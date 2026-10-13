"use client";

import { MemberAvatar, PersonCell, StatePill, Tooltip, hasStateMap, registerStateMap } from "@kiwiply/ui";
import { approvalLabel, visibilityLabel, type Approval, type PersonRef, type ResumeRow, type Visibility } from "@/lib/ent/resumes";

/** The three small state maps of the Resumes board (one StatePill for every enterprise domain). */
if (!hasStateMap("resume-approval")) registerStateMap("resume-approval", { APPROVED: "green", PENDING: "amber", REJECTED: "red" });
if (!hasStateMap("resume-visibility")) registerStateMap("resume-visibility", { INTERNAL: "grey", PUBLIC: "grey-outline", PRIVATE: "red" });
if (!hasStateMap("resume-primary")) registerStateMap("resume-primary", { PRIMARY: "green" });

export function ApprovalPill({ status }: { status: Approval | string }) {
  return <StatePill domain="resume-approval" state={status} label={approvalLabel(status)} />;
}

export function VisibilityPill({ visibility }: { visibility: Visibility | string }) {
  return <StatePill domain="resume-visibility" state={visibility} label={visibilityLabel(visibility)} />;
}

/** "Primary" when the resume is the consultant's primary one, otherwise a dash (as on the board). */
export function PrimaryCell({ primary }: { primary: boolean }) {
  return primary ? <StatePill domain="resume-primary" state="PRIMARY" label="Primary" /> : <span className="text-muted" aria-label="Not primary">{"—"}</span>;
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

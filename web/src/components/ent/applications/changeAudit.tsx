"use client";

import type { ReactNode } from "react";
import { actorLine, actorText, isViewer, type AnyActor, type ChangeActor, type Viewer } from "@/lib/actors";
import type { FieldChange } from "@/lib/applications";
import { changeChip } from "@/components/app-v3/applications/TimelineTab";
import UpdatedBy, { RelationTag, absoluteTime } from "@/components/app-v3/applications/UpdatedBy";

/**
 * "Updated 2h ago by Sarah Chen MARKETER" for the organization's records (docs/change-audit/README.md section 3.4): the same words and the same chip
 * as the personal tracker (`lib/actors.ts`), read through the viewer's SEAT (`memberId`). One module for the Applications board, the interviews and
 * the submissions, so the admin and the consultant read the same line for the same record.
 */

/** The viewer of an organization page: their seat. */
export const seatViewer = (memberId: number | null | undefined): Viewer => ({ memberId: memberId ?? null });

/**
 * The header lines of a record: "Updated 2h ago by Sarah Chen MARKETER" (title: the absolute time and who), and, when the record says who added it,
 * "Created Sep 30 by Priya Raman ADMIN". Draws nothing for a record that carries no audit fields (an older API answer).
 */
export function UpdatedMeta({
  updatedAt,
  updatedBy,
  createdAt,
  createdBy,
  me,
  now,
  className,
}: {
  updatedAt?: string | null;
  updatedBy?: ChangeActor | null;
  createdAt?: string | null;
  createdBy?: ChangeActor | null;
  me: Viewer;
  now: number;
  className?: string;
}) {
  if (!updatedAt && !createdAt) return null;
  return (
    <div className={className} data-change-audit>
      {updatedAt && <UpdatedBy updatedAt={updatedAt} actor={updatedBy ?? null} me={me} now={now} />}
      {createdAt && createdBy && (
        <p className="mt-0.5 flex flex-wrap items-center gap-x-1 text-[12px] leading-snug text-v2-muted" data-created-by title={`${absoluteTime(createdAt)} ${actorLine(createdBy, null, null, me)}`}>
          <span>
            Created {shortDay(createdAt)} {actorLine(createdBy, null, null, me)}
          </span>
          <RelationTag actor={createdBy} me={me} />
        </p>
      )}
    </div>
  );
}

function shortDay(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** The actor of a TimelineFeed row: the person's name and their relation tag ("MARKETER", "ADMIN", "SYSTEM"); "you" with no tag for the viewer. */
export function feedActor(by: AnyActor, me: Viewer): { name: string; tag?: string } | undefined {
  if (!by) return undefined;
  if (isViewer(by, me)) return { name: "you" };
  const name = by && "kind" in by && by.kind !== "PERSON" ? "Kiwiply" : actorText(by, me);
  const relation = "relation" in by ? by.relation : null;
  return relation ? { name, tag: relation.toUpperCase() } : { name };
}

/** The collapsed "Details" chip row of a history entry (field names, and from to values for enums and dates: never free text). */
export function changesDetail(changes: FieldChange[] | null | undefined, base?: ReactNode): ReactNode {
  const list = changes ?? [];
  if (list.length <= 1) return base;
  return (
    <>
      {base}
      <details className="mt-1 text-[12px] text-muted">
        <summary className="cursor-pointer select-none">Details</summary>
        <ul className="mt-1 flex flex-wrap gap-1.5" aria-label="What changed">
          {list.map((c) => (
            <li key={c.f} className="rounded-full bg-paper-2 px-2 py-0.5 text-ink-soft">
              {changeChip(c)}
            </li>
          ))}
        </ul>
      </details>
    </>
  );
}

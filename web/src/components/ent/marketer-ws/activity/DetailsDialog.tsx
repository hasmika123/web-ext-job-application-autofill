"use client";

import type { ReactNode } from "react";
import { Button, Dialog } from "@kiwiply/ui";
import { STATUS_LABEL, dayText, timeText, type ActivityRow } from "@/lib/ent/marketer-ws/activity";
import { IconTile, typeIcon } from "./bits";

/** The kebab's "View details": every field of one feed line, read only. */

const SOURCE_TEXT: Record<string, string> = {
  MANUAL: "Logged by hand", RESUME: "Resume change log", OPPORTUNITY: "Opportunities", SUBMISSION: "Submissions", FOLLOWUP: "Follow-ups", INTERVIEW: "Interviews", APPLICATION: "Applications", PLACEMENT: "Placements",
};

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-[12px] font-semibold text-muted">{label}</dt>
      <dd className="mt-0.5 text-[13.5px] text-ink">{children || "—"}</dd>
    </div>
  );
}

export default function DetailsDialog({ row, onClose }: { row: ActivityRow; onClose: () => void }) {
  return (
    <Dialog
      open
      onClose={onClose}
      title={
        <span className="flex items-center gap-2.5">
          <IconTile spec={typeIcon(row.type, row.group)} size={32} />
          <span>{row.title}</span>
        </span>
      }
      footer={
        <div className="flex justify-end">
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
      }
    >
      <dl data-details-dialog className="grid gap-3.5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label="Details">{row.subtitle}</Field>
        </div>
        <Field label="When">{`${dayText(row.at)}, ${timeText(row.at)}`}</Field>
        <Field label="Status">{STATUS_LABEL[row.status]}</Field>
        <Field label="Done by">{row.actor?.name}</Field>
        <Field label="Consultant">{row.consultant?.name}</Field>
        <Field label="Client">{row.client?.name}</Field>
        <Field label="Type">{row.tag ? `${row.groupLabel} / ${row.tag}` : row.groupLabel}</Field>
        <Field label="Recorded from">{SOURCE_TEXT[row.source] ?? "Activity records"}</Field>
      </dl>
    </Dialog>
  );
}

"use client";

import { useState } from "react";
import { Button, EmptyState, PlusIcon, useToast } from "@kiwiply/ui";
import { browserZone } from "@/lib/applications";
import { tomorrowAt } from "@/lib/datetime-local";
import { createInterview, deleteInterview, setInterviewOutcome, type Interview, type InterviewInput } from "@/lib/interviews";
import { undoToast } from "@/lib/undo-toast";
import InterviewForm from "./InterviewForm";

/** A new interview starts tomorrow at this hour, so the form opens with something sensible to edit. */
const DEFAULT_START_HOUR = 10;

const byStart = (a: Interview, b: Interview) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime() || a.id - b.id;

/** The interviews of one application: add one, edit any in place (autosaved), delete with Undo. */
export default function InterviewTab({
  applicationId,
  interviews,
  onCount,
}: {
  applicationId: number;
  interviews: Interview[];
  /** An interview was added or removed: the list row, the next step and the timeline should refresh. */
  onCount(count: number): void;
}) {
  const toast = useToast();
  const [items, setItems] = useState<Interview[]>(() => [...interviews].sort(byStart));
  const [busy, setBusy] = useState(false);

  function update(next: Interview[]) {
    setItems(next);
    onCount(next.length);
  }

  async function add() {
    setBusy(true);
    const input: InterviewInput = { kind: "VIDEO", startsAt: tomorrowAt(DEFAULT_START_HOUR) };
    const tz = browserZone();
    if (tz) input.tz = tz;
    const r = await createInterview(applicationId, input);
    setBusy(false);
    if (r.kind === "ok") update([...items, r.data].sort(byStart));
    else toast({ title: "Couldn't add the interview", description: r.message, variant: "error" });
  }

  async function remove(i: Interview) {
    const rest = items.filter((x) => x.id !== i.id);
    const r = await deleteInterview(applicationId, i.id);
    if (r.kind === "error" && r.status !== 404) {
      toast({ title: "Couldn't delete the interview", description: r.message, variant: "error" });
      return;
    }
    update(rest);
    undoToast(toast, {
      title: "Interview deleted",
      onUndo: () => {
        const input: InterviewInput = {
          kind: i.kind,
          startsAt: i.startsAt,
          endsAt: i.endsAt,
          tz: i.tz,
          location: i.location,
          interviewer: i.interviewer,
          notes: i.notes,
        };
        void createInterview(applicationId, input).then(async (back) => {
          if (back.kind !== "ok") return toast({ title: "Couldn't bring the interview back", description: back.message, variant: "error" });
          let restored = back.data;
          if (i.outcome !== "PENDING") {
            const o = await setInterviewOutcome(applicationId, restored.id, i.outcome);
            if (o.kind === "ok") restored = o.data;
          }
          setItems((all) => {
            const next = [...all, restored].sort(byStart);
            onCount(next.length);
            return next;
          });
        });
      },
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] text-ink-soft">Dates, links and how it went. Autosaved.</p>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => void add()} className="min-h-10 flex-none">
          <PlusIcon aria-hidden className="h-4 w-4" />
          Add interview
        </Button>
      </div>
      {items.length === 0 ? (
        <EmptyState
          variant="inline"
          title="No interviews yet"
          description="Got a date from a recruiter? Add it here and put it on your calendar in one tap."
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((i) => (
            <li key={i.id}>
              <InterviewForm
                interview={i}
                onChange={(next) => setItems((all) => all.map((x) => (x.id === next.id ? next : x)))}
                onDelete={() => void remove(i)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

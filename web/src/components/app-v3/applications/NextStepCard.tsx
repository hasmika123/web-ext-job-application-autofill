"use client";

import { useRef, useState } from "react";
import { cn } from "@kiwiply/ui";
import { patchApplication, dayAndTime, type Application, type ApplicationPatch } from "@/lib/applications";
import { useAutosave } from "@/lib/autosave";
import { fromLocalDate, toLocalDate } from "@/lib/datetime-local";
import { toAutosave } from "@/lib/tracker-client";
import AutosaveChip from "./AutosaveChip";

interface Form {
  action: string;
  date: string;
}

/** The longest "next step" the API takes (`nextAction` is varchar(160)); the field stops there instead of failing. */
const ACTION_MAX = 160; // config-literal-ok: mirrors the API column size for the input's maxLength, not a tunable

/**
 * "Next step": what the person means to do next ("Send a thank-you note") and by when, saved as they type
 * (no Save button; the chip says where it stands). Above it, the one thing Kiwiply already knows is coming (an
 * interview on the calendar, "Review offer"), read-only because it follows the data.
 */
export default function NextStepCard({ app, onPatched }: { app: Application; onPatched(patch: Partial<Application>): void }) {
  const [form, setForm] = useState<Form>({ action: app.nextAction ?? "", date: toLocalDate(app.nextActionAt) });
  const saved = useRef<Form>(form);

  const autosave = useAutosave<Form>(form, async (v) => {
    const patch: ApplicationPatch = {};
    if (v.action !== saved.current.action) patch.nextAction = v.action.trim() || null;
    if (v.date !== saved.current.date) patch.nextActionAt = v.date ? fromLocalDate(v.date) : null;
    if (Object.keys(patch).length === 0) return { kind: "ok" };
    const r = await patchApplication(app.id, patch);
    if (r.kind === "ok") {
      saved.current = v;
      onPatched({ nextAction: r.data.nextAction ?? null, nextActionAt: r.data.nextActionAt ?? null, nextStep: r.data.nextStep ?? null, lastEventAt: r.data.lastEventAt });
    }
    return toAutosave(r);
  });

  const coming = app.nextStep && app.nextStep.label !== app.nextAction ? app.nextStep : null;

  return (
    <section aria-labelledby={`next-${app.id}`} className="rounded-2xl border border-v2-line/70 bg-paper p-3.5 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h3 id={`next-${app.id}`} className="font-display text-[15px] font-bold text-ink">
          Next step
        </h3>
        <AutosaveChip autosave={autosave} />
      </div>
      {coming && (
        <p className="mt-1.5 text-[13px] text-ink-soft" data-coming-up>
          <span className="font-semibold text-ink">Coming up:</span> {coming.label}
          {coming.at ? ` · ${dayAndTime(coming.at)}` : ""}
        </p>
      )}
      <div className="mt-2.5 grid gap-2.5 sm:grid-cols-[minmax(0,1fr)_11rem]">
        <label className="block min-w-0">
          <span className="mb-1 block text-[12px] font-semibold text-v2-muted">What&apos;s next?</span>
          <input
            type="text"
            value={form.action}
            maxLength={ACTION_MAX}
            placeholder="e.g. Send a thank-you note"
            onChange={(e) => setForm((f) => ({ ...f, action: e.target.value }))}
            className={FIELD}
          />
        </label>
        <label className="block min-w-0">
          <span className="mb-1 block text-[12px] font-semibold text-v2-muted">By when</span>
          <input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} className={FIELD} />
        </label>
      </div>
    </section>
  );
}

export const FIELD =
  "h-11 w-full min-w-0 rounded-xl border border-v2-line bg-paper px-3 text-[14px] text-ink placeholder:text-v2-muted focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent sm:h-10";

const OUTCOMES = [
  { value: "ACCEPTED", label: "Yes, I accepted" },
  { value: "DECLINED", label: "I passed on it" },
  { value: null, label: "Still deciding" },
] as const;

/** "Did you accept? 🎉": shown on an offer; one tap records the answer (Undo is the parent's toast). */
export function OfferOutcome({ outcome, onPick }: { outcome: string | null | undefined; onPick(next: "ACCEPTED" | "DECLINED" | null): void }) {
  return (
    <section aria-label="Offer outcome" className="rounded-2xl border border-v2-violet/30 bg-v2-violet-soft/60 p-3.5 sm:p-4">
      <h3 className="font-display text-[15px] font-bold text-ink">Did you accept? 🎉</h3>
      <p className="mt-0.5 text-[13px] text-ink-soft">An offer is a big deal. Tell us how it went so your numbers stay honest.</p>
      <div role="group" aria-label="Offer outcome" className="mt-2.5 flex flex-wrap gap-1.5">
        {OUTCOMES.map((o) => {
          const on = (outcome ?? null) === o.value;
          return (
            <button
              key={o.label}
              type="button"
              aria-pressed={on}
              onClick={() => {
                if (!on) onPick(o.value);
              }}
              className={cn(
                "inline-flex min-h-9 items-center rounded-full border px-3 text-[13px] font-semibold transition-colors motion-safe:active:scale-95",
                on ? "border-transparent bg-v2-violet text-white" : "border-v2-line bg-paper text-ink-soft hover:bg-paper-2",
              )}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </section>
  );
}
